import "server-only";
import { callExternal } from "@/lib/external";

const SECRET = process.env.TURNSTILE_SECRET_KEY ?? "";
/** Explicit, recorded escape hatch — the same shape as SAFETY_DEV_BYPASS in
 *  lib/csam-scan.ts. Absent, the gate is closed. */
const DEV_BYPASS = process.env.CAPTCHA_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production";

/** Verify a Turnstile token server-side (for forms that aren't Supabase-auth calls,
 *  like the access-code gate).
 *
 *  KRA-015 — this used to return TRUE when the secret was missing and TRUE after
 *  any verification exception. Both were written down as deliberate ("the site
 *  works before setup", "rate limiting is the real protection"), and both meant
 *  the same thing in practice: an attacker who could cause or wait for a Turnstile
 *  outage walked through a gate the rest of the system assumed had been applied.
 *  Rate limiting is a different control with a different threat model; it is not a
 *  substitute for the one that is supposed to be running.
 *
 *  Three states now, and INDETERMINATE never resolves to allow:
 *    · valid token       → allow
 *    · missing/invalid   → deny
 *    · unconfigured, vendor error, timeout → deny, unless CAPTCHA_DEV_BYPASS is
 *      explicitly set outside production.
 *
 *  Deployment note: with this change TURNSTILE_SECRET_KEY must be set in
 *  production or the gate closes. That is the intended direction — a closed gate
 *  is a visible failure; an open one is not. */
export async function verifyTurnstile(token: string | null, ip?: string | null): Promise<boolean> {
  if (!SECRET) {
    if (DEV_BYPASS) {
      console.warn("[captcha] CAPTCHA_DEV_BYPASS active — never set this in production");
      return true;
    }
    console.error("[captcha] TURNSTILE_SECRET_KEY missing — failing closed");
    return false;
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: SECRET, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    // KCDX-056: had no timeout. This verifier fails OPEN, so a hung vendor used
    // to hold the request until the platform killed it and then open the gate
    // anyway — the worst of both. 3s, one retry (verification is idempotent).
    const res = await callExternal({ vendor: "turnstile", timeoutMs: 3000, retries: 1 }, (signal) =>
      fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal }),
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    // Was `return true`. An unreachable verifier is an indeterminate answer, and
    // an indeterminate answer to "is this a human" is not a yes.
    console.error("[captcha] verify failed — failing closed", e);
    return false;
  }
}
