import { createHash } from "node:crypto";

/** Log scrubbing (KCDX-068).
 *
 *  Error telemetry was persisted as it arrived: the raw request path, up to 6,000
 *  characters of stack, and — in `account/log-actions` — a message, detail and
 *  URL supplied by the browser. A request path is not a neutral string here. It
 *  carries invite codes (`/gate/ABCD-EFGH-IJKL`), queue join codes (`/q/XK4M2P`),
 *  tournament codes, and user ids; a stack carries whatever was in scope when
 *  something broke, including query values and vendor error payloads. None of
 *  that is needed to fix a bug, and all of it is durable once written.
 *
 *  THE SHAPE OF THE FIX. Not deletion — a log with the identifiers stripped out
 *  is useless, and useless logs get replaced by someone re-adding the raw ones.
 *  So: templates instead of paths (`/q/:code`, not `/q/XK4M2P`), and stable
 *  pseudonyms instead of ids (`id:9f2a1c4e`, the same every time for the same
 *  UUID). You can still follow one user's errors across a hundred rows; you just
 *  cannot learn who they are from the log.
 *
 *  Pseudonyms are an unkeyed SHA-256 prefix. That is honest about what it is: a
 *  correlation handle, not a secret. UUIDs are not guessable, so there is nothing
 *  to brute-force from a known-plaintext angle; if that ever changes — if we
 *  pseudonymise something enumerable like an email — it needs a keyed HMAC and
 *  this comment needs revisiting.
 *
 *  Pure and dependency-free so it can be tested directly, which the finding asks
 *  for: "test the scrubber". */

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Stable, non-reversible handle for an identifier. Same input, same output —
 *  that is the whole point, otherwise correlation dies with the raw value. */
export function pseudonymize(id: string): string {
  return `id:${createHash("sha256").update(id.toLowerCase()).digest("hex").slice(0, 8)}`;
}

/** A URL path reduced to its route shape. `/q/XK4M2P/court-2` → `/q/:code/:seg`.
 *  Query strings keep their KEYS and lose every value: knowing that `?zip=` was
 *  present is diagnostic, knowing it was `90066` is not. */
export function templatePath(raw: string): string {
  if (!raw) return "";
  let path = raw;
  let query = "";
  const q = raw.indexOf("?");
  if (q >= 0) {
    path = raw.slice(0, q);
    query = raw.slice(q + 1);
  }

  const segs = path.split("/").map((s) => {
    if (!s) return s;
    if (UUID_RE.test(s)) { UUID_RE.lastIndex = 0; return ":id"; }
    if (/^\d+$/.test(s)) return ":n";
    // Klimr's code formats: XXXX-XXXX-XXXX invites, and the 4–12 char
    // uppercase alphanumerics used for queue/tournament/display codes.
    if (/^[A-Z0-9]{4}(-[A-Z0-9]{4}){1,3}$/.test(s)) return ":code";
    if (/^[A-Z0-9]{4,12}$/.test(s) && /\d/.test(s)) return ":code";
    if (/^[^/]{40,}$/.test(s)) return ":blob";
    return s;
  });

  let out = segs.join("/");
  if (query) {
    const keys = query
      .split("&")
      .map((kv) => kv.split("=")[0])
      .filter(Boolean)
      .slice(0, 12);
    if (keys.length) out += `?${keys.map((k) => `${k}=`).join("&")}`;
  }
  return out.slice(0, 300);
}

type Rule = { re: RegExp; to: string };

// Order matters: the most specific patterns run first, so a JWT is not partly
// eaten by the generic token rule before it is recognised.
const RULES: Rule[] = [
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, to: "[jwt]" },
  { re: /\b(?:sb|sk|pk|rk)_[A-Za-z0-9_-]{12,}/g, to: "[key]" },
  { re: /\b(?:bearer|authorization|apikey|api_key|token|secret|password|passwd|pwd)\b\s*[:=]\s*\S+/gi, to: "$&" },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, to: "[email]" },
  // Requires at least one LETTER: `2222-3333-4444` is three digit groups, and
  // without this it ate the middle of every UUID before the UUID rule ran.
  { re: /\b(?=[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b)(?=[-0-9A-Z]*[A-Z])[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, to: "[code]" },
  { re: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, to: "[geo]" },
  { re: /\+?\d[\d().\s-]{8,}\d/g, to: "[phone]" },
];

/** Redact secrets and direct identifiers from free text, keeping the shape of
 *  the message. UUIDs become stable pseudonyms rather than disappearing. */
export function scrubText(input: string | null | undefined, maxLen = 2000): string | null {
  if (input == null) return null;
  let s = String(input);

  // Key/value secrets keep the key and lose the value — `token: [redacted]`
  // still tells you which credential was involved.
  s = s.replace(
    /\b(bearer|authorization|apikey|api_key|token|secret|password|passwd|pwd)\b(\s*[:=]\s*)(\S+)/gi,
    (_m, k: string, sep: string) => `${k}${sep}[redacted]`,
  );

  // UUIDs FIRST. They are the most structured thing in the string, and looser
  // patterns below will otherwise chew pieces out of them — the code rule
  // matched `2222-3333-4444` and the phone rule took the rest, which a test
  // caught only because it asserted the pseudonym SURVIVED rather than merely
  // that the raw id was gone.
  s = s.replace(UUID_RE, (m) => pseudonymize(m));

  for (const { re, to } of RULES) {
    if (to === "$&") continue; // handled above
    s = s.replace(re, to);
  }
  return s.slice(0, maxLen);
}

/** Everything an error row should carry, and nothing it should not. */
export function scrubLogRow(row: {
  message?: string | null;
  detail?: string | null;
  url?: string | null;
  userAgent?: string | null;
}): { message: string; detail: string | null; url: string | null; user_agent: string | null } {
  return {
    message: scrubText(row.message, 1000) ?? "(no message)",
    // Stacks are bounded far below the previous 6,000: file/line/function is
    // what makes a stack useful, and the tail is mostly framework frames.
    detail: scrubText(row.detail, 2000),
    url: row.url ? templatePath(scrubText(row.url, 300) ?? "") : null,
    user_agent: row.userAgent ? String(row.userAgent).slice(0, 200) : null,
  };
}
