import "server-only";
import { callExternal } from "@/lib/external";

const SECRET = process.env.TURNSTILE_SECRET_KEY ?? "";

/** Verify a Turnstile token server-side (for forms that aren't Supabase-auth calls,
 *  like the access-code gate). Returns true when CAPTCHA isn't configured yet so the
 *  site works before setup; fails open on a network error (the gate is low-stakes and
 *  rate limiting is the real protection), but rejects a missing/invalid token. */
export async function verifyTurnstile(token: string | null, ip?: string | null): Promise<boolean> {
  if (!SECRET) return true;
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
    console.error("[captcha] verify failed", e);
    return true;
  }
}
