"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parseUserAgent } from "@/lib/useragent";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";
import { secondsLockedOut, recordTotpFailure, clearTotpFailures } from "@/lib/mfa-lockout";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emails/templates";

/** Record a completed sign-in (called after the 2FA step succeeds) for the security
 *  page's login-activity list. Values come from request headers, never the client. */
export async function recordLogin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const h = await headers();
  const ua = h.get("user-agent");
  const xff = h.get("x-forwarded-for");
  const ip = xff ? (xff.split(",")[0] ?? "").trim() || null : h.get("x-real-ip");
  const parsed = parseUserAgent(ua);
  const city = h.get("x-vercel-ip-city");
  const region = h.get("x-vercel-ip-country-region");
  const country = h.get("x-vercel-ip-country");

  try {
    const { count } = await supabase.from("login_events").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const firstLogin = (count ?? 0) === 0;

    await supabase.from("login_events").insert({
      user_id: user.id,
      ip,
      user_agent: ua ? ua.slice(0, 400) : null,
      device: parsed.device,
      browser: parsed.browser,
      os: parsed.os,
      city: city ? decodeURIComponent(city) : null,
      region: region || null,
      country: country || null,
    });

    // Welcome only genuinely new accounts: first recorded login + freshly created.
    const created = user.created_at ? new Date(user.created_at).getTime() : 0;
    const fresh = created > 0 && Date.now() - created < 24 * 60 * 60 * 1000;
    if (firstLogin && fresh && user.email) {
      const origin = h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://klimr.com";
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const { subject, html } = welcomeEmail({ name: prof?.display_name ?? "there", appUrl: `${origin}/account` });
      await sendEmail({ to: user.email, subject, html });
    }
  } catch (e) {
    console.error("[login] record failed", e);
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signOutEverywhereAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/");
}

/** Server-fronted TOTP verification (audit SEC-006 · D6 amended · K1-02).
 *  Every 6-digit code — login challenge AND enrollment activation — verifies
 *  here so the 0055 lockout policy (5 wrong codes / 15 min → 15-min lock)
 *  and a per-IP throttle apply. The browser never calls mfa.verify directly.
 *  Session cookies are updated by the server client, so success leaves the
 *  browser at AAL2 exactly as before. */
export async function verifyTotpAction(
  factorId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string; lockedForSeconds?: number }> {
  const clean = String(code ?? "").replace(/\D/g, "");
  const fid = String(factorId ?? "");
  if (!fid || clean.length !== 6) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired — sign in again." };

  const ip = await clientIp();
  if (!(await rateLimitStrict(`totp:ip:${ip}`, 10, 60))) {
    return { ok: false, error: "Too many attempts from this connection — wait a minute and try again." };
  }

  const lockedFor = await secondsLockedOut(user.id, fid);
  if (lockedFor > 0) {
    const mins = Math.max(1, Math.ceil(lockedFor / 60));
    return { ok: false, error: `Too many incorrect codes. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`, lockedForSeconds: lockedFor };
  }

  const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: fid });
  if (cErr || !ch) return { ok: false, error: "Something went wrong verifying that code. Try again." };
  const { error: vErr } = await supabase.auth.mfa.verify({ factorId: fid, challengeId: ch.id, code: clean });

  if (vErr) {
    const nowLocked = await recordTotpFailure(user.id, fid);
    if (nowLocked > 0) {
      return { ok: false, error: "Too many incorrect codes. Your account is locked for 15 minutes.", lockedForSeconds: nowLocked };
    }
    return { ok: false, error: "That code didn't match. Check your authenticator app and try again." };
  }

  await clearTotpFailures(user.id, fid).catch(() => {});
  return { ok: true };
}
