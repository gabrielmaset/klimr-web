"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateCookieName, gateToken } from "@/lib/gate";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { codeLockSeconds, noteCodeFailure, clearCodeAttempts } from "@/lib/lockout";
import { verifyTurnstile } from "@/lib/captcha";
import { normalizeInviteCode } from "@/lib/invite";
import { sendEmail } from "@/lib/email";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const secure = process.env.NODE_ENV === "production";

// One-time gate access codes emailed to existing members.
const ACCESS_CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const GATE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1 — matches lib/invite

/** A one-time code in the same XXXX-XXXX-XXXX shape as invite codes, so the gate's
 *  code box accepts it unchanged. Stored in gate_access_codes, never invite_codes. */
function genGateCode(): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += GATE_CODE_ALPHABET[randomInt(GATE_CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function accessCodeHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b">
  <div style="max-width:440px;margin:0 auto;padding:32px 24px">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0a0a0b">klimr</div>
    <p style="margin:24px 0 8px;font-size:15px;line-height:1.5">Here's your access code to enter Klimr:</p>
    <div style="margin:16px 0;padding:16px;border-radius:12px;background:#ffffff;border:1px solid #e4e4e7;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:0.15em;color:#0a0a0b">${code}</div>
    <p style="margin:8px 0;font-size:13px;color:#71717a">Enter it on the Klimr welcome screen, then sign in as usual. This code works once and expires in 30 minutes.</p>
    <p style="margin:16px 0 0;font-size:13px;color:#71717a">If you didn't request this, you can safely ignore this email.</p>
  </div></body></html>`;
}

/**
 * Invite-code portal for klimr.com. Validates the code WITHOUT consuming it —
 * consumption happens only at real signup — then opens the site and remembers
 * the code so /signup can prefill it. Protected by per-IP rate limiting and
 * (once configured) a CAPTCHA so the portal can't be hammered.
 */
const INVITE_CLAIM_SECONDS = 72 * 60 * 60; // 3 days to finish signing up

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

  // 1) A real, active, not-yet-exhausted invite. The code is CONSUMED here —
  //    entering it at the gate claims a use immediately (atomic, optimistic
  //    guard on the read value so two racers can't share one use). The claim
  //    lives in a 72-hour cookie: come back and sign up any time inside the
  //    window; let it lapse and you need a fresh code (this one stays spent).
  if (data && data.active && data.uses < data.max_uses) {
    const { data: consumed } = await admin
      .from("invite_codes")
      .update({ uses: data.uses + 1, last_used_at: new Date().toISOString() })
      .eq("code", code)
      .eq("uses", data.uses)
      .select("code")
      .maybeSingle();
    if (!consumed) {
      await noteCodeFailure(bucket);
      redirect("/gate?error=invalid");
    }
    await clearCodeAttempts(bucket);
    const jar = await cookies();
    jar.set(gateCookieName("site"), gateToken("site"), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: INVITE_CLAIM_SECONDS });
    // The claim itself — read back by /signup to prefill and to honor the
    // already-consumed code for this visitor.
    jar.set("klimr_invite", code, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: INVITE_CLAIM_SECONDS });
    redirect("/");
  }

  // 2) Otherwise it may be a one-time code we emailed to an existing member.
  //    Claim it atomically: only succeeds if unused and unexpired.
  const nowIso = new Date().toISOString();
  const { data: claimed } = await admin
    .from("gate_access_codes")
    .update({ used_at: nowIso })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("code")
    .maybeSingle();

  if (claimed) {
    await clearCodeAttempts(bucket);
    const jar = await cookies();
    // Gate cookie only — a returning member isn't signing up, so no prefill.
    jar.set(gateCookieName("site"), gateToken("site"), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: THIRTY_DAYS });
    redirect("/login");
  }

  // Neither an invite nor a valid access code.
  await noteCodeFailure(bucket);
  redirect("/gate?error=invalid");
}

/**
 * "Already have an account?" bypass. If the address belongs to an active account,
 * email it a one-time code that opens the gate. To prevent account enumeration we
 * ALWAYS finish the same way — the caller is never told whether an account exists.
 */
export async function requestAccessCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const captchaToken = String(formData.get("captchaToken") ?? "") || null;
  const ip = await clientIp();

  const okCaptcha = await verifyTurnstile(captchaToken, ip);
  const looksLikeEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Throttle by IP (abuse) and by address (email-bombing). Over limit → simply
  // don't send; the user still sees the same neutral message.
  const underIpLimit = await rateLimit(`gateemail:ip:${ip}`, 5, 900);
  const underAddrLimit = looksLikeEmail ? await rateLimit(`gateemail:addr:${email}`, 3, 3600) : true;

  if (okCaptcha && looksLikeEmail && underIpLimit && underAddrLimit) {
    const admin = createAdminClient();
    const { data: active } = await admin.rpc("account_active_for_email", { p_email: email });
    if (active === true) {
      const code = genGateCode();
      const expiresAt = new Date(new Date().getTime() + ACCESS_CODE_TTL_MS).toISOString();
      // Keep at most one live code per address.
      await admin.from("gate_access_codes").delete().eq("email", email).is("used_at", null);
      const { error: insErr } = await admin.from("gate_access_codes").insert({ code, email, expires_at: expiresAt });
      if (!insErr) {
        await sendEmail({ to: email, subject: "Your Klimr access code", html: accessCodeHtml(code) });
      }
    }
  }

  // Never reveal whether the address has an account.
  redirect("/gate?sent=1");
}
