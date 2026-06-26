import "server-only";

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
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    console.error("[captcha] verify failed", e);
    return true;
  }
}
