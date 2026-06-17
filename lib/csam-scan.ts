import "server-only";

/**
 * Known-CSAM hash matching. Runs BEFORE storage and before the AI classifier.
 *
 * The actual matching is delegated to a provider you configure, because the hash
 * databases and matching services are access-gated (you can't ship them in code):
 *   - CSAM_SCAN_PROVIDER=webhook  → POST to CSAM_SCAN_WEBHOOK_URL with
 *       { sha256, mediaType, dataBase64 } and expect { match: boolean, matchId?: string }.
 *     Back that endpoint with Thorn Safer, the Cloudflare CSAM Scanning Tool, or an
 *     NCMEC-hash matcher once you're an approved ESP. See SAFETY.md.
 *   - CSAM_SCAN_PROVIDER=none (default) → image uploads are BLOCKED (fail-closed),
 *     unless SAFETY_DEV_BYPASS=true (local development ONLY — never in production).
 *
 * Fail-closed everywhere: a configured provider that errors blocks the upload.
 */

export type ScanResult = {
  match: boolean; // a known-CSAM hash hit
  blocked: boolean; // upload must be refused (not configured, or scan failed)
  provider: string;
  matchId?: string;
  reason?: string;
};

const PROVIDER = process.env.CSAM_SCAN_PROVIDER ?? "none";
const DEV_BYPASS = process.env.SAFETY_DEV_BYPASS === "true";

function authHeaders(): Record<string, string> {
  const token = process.env.CSAM_SCAN_WEBHOOK_TOKEN;
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function scanForKnownCSAM(bytes: Buffer, sha256: string, mediaType: string): Promise<ScanResult> {
  if (PROVIDER === "none") {
    if (DEV_BYPASS) {
      console.warn(
        "[safety] CSAM hash-matching is DISABLED (SAFETY_DEV_BYPASS=true). " +
          "This is for local development only — never enable it in production.",
      );
      return { match: false, blocked: false, provider: "dev-bypass" };
    }
    return {
      match: false,
      blocked: true,
      provider: "none",
      reason: "Photo uploads aren't enabled yet.",
    };
  }

  try {
    if (PROVIDER === "webhook") {
      const url = process.env.CSAM_SCAN_WEBHOOK_URL;
      if (!url) return { match: false, blocked: true, provider: "webhook", reason: "Scan endpoint not set." };
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sha256, mediaType, dataBase64: bytes.toString("base64") }),
      });
      if (!res.ok) return { match: false, blocked: true, provider: "webhook", reason: "Safety scan failed." };
      const json = (await res.json()) as { match?: unknown; matchId?: unknown };
      return {
        match: json.match === true,
        blocked: false,
        provider: "webhook",
        matchId: typeof json.matchId === "string" ? json.matchId : undefined,
      };
    }
    return { match: false, blocked: true, provider: PROVIDER, reason: "Unknown scan provider." };
  } catch {
    return { match: false, blocked: true, provider: PROVIDER, reason: "Safety scan error." };
  }
}
