"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateCookieName, gateToken } from "@/lib/gate";
import { clientIp } from "@/lib/ratelimit";
import { codeLockSeconds, noteCodeFailure, clearCodeAttempts } from "@/lib/lockout";
import { verifyTurnstile } from "@/lib/captcha";
import { normalizeInviteCode } from "@/lib/invite";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const secure = process.env.NODE_ENV === "production";

/**
 * Invite-code portal for klimr.com. Validates the code WITHOUT consuming it —
 * consumption happens only at real signup — then opens the site and remembers
 * the code so /signup can prefill it. Protected by per-IP rate limiting and
 * (once configured) a CAPTCHA so the portal can't be hammered.
 */
export async function enterSite(formData: FormData) {
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  if (!code) redirect("/gate?error=empty");

  const ip = await clientIp();
  const bucket = `codeguess:${ip}`;

  // Locked out after too many wrong codes? (Checked before anything else.)
  if ((await codeLockSeconds(bucket)) > 0) redirect("/gate?error=locked");

  // Bot/abuse check (no-op until Turnstile is configured). A CAPTCHA failure does
  // not count toward the wrong-code lockout.
  const captchaToken = String(formData.get("captchaToken") ?? "") || null;
  if (!(await verifyTurnstile(captchaToken, ip))) redirect("/gate?error=captcha");

  const admin = createAdminClient();
  const { data } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses, active")
    .eq("code", code)
    .maybeSingle();

  // Must be a real, active, not-yet-exhausted invite — uses is NOT incremented here.
  if (!data || !data.active || data.uses >= data.max_uses) {
    await noteCodeFailure(bucket);
    redirect("/gate?error=invalid");
  }

  await clearCodeAttempts(bucket);

  const jar = await cookies();
  jar.set(gateCookieName("site"), gateToken("site"), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  // Plain code, read back by /signup to prefill. Not security-sensitive.
  jar.set("klimr_invite", code, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  redirect("/");
}
