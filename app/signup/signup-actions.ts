"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export type PrecheckResult = { ok: true } | { ok: false; error: string };

/** Friendly invite-code validation before the client sends the magic link. Rate
 *  limited per IP so invite codes can't be enumerated. The database trigger remains
 *  the authoritative gate at account creation either way. */
export async function precheckInvite(code: string): Promise<PrecheckResult> {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,40}$/.test(c)) return { ok: false, error: "Enter your invite code." };

  const ip = await clientIp();
  const allowed = await rateLimit(`invite:${ip}`, 10, 600); // 10 tries / 10 min per IP
  if (!allowed) return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };

  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses, active")
    .eq("code", c)
    .maybeSingle();
  if (error) console.error("[signup] invite lookup error:", error);

  if (!invite || !invite.active || invite.uses >= invite.max_uses) {
    return { ok: false, error: "That invite code is not valid or has been fully used. Check it and try again, or write hello@klimr.com." };
  }
  return { ok: true };
}
