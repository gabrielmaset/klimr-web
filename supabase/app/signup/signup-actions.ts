"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/ratelimit";
import { codeLockSeconds, noteCodeFailure, clearCodeAttempts, lockMinutes } from "@/lib/lockout";
import { normalizeInviteCode, isValidInviteCode } from "@/lib/invite";

export type PrecheckResult = { ok: true } | { ok: false; error: string };

/** Friendly invite-code validation before the client sends the magic link. Rate
 *  limited per IP so invite codes can't be enumerated. The database trigger remains
 *  the authoritative gate at account creation either way. */
export async function precheckInvite(code: string): Promise<PrecheckResult> {
  const c = normalizeInviteCode(code);
  if (!isValidInviteCode(c)) return { ok: false, error: "Enter a valid invite code." };

  const ip = await clientIp();
  const bucket = `codeguess:${ip}`;

  // Locked out after too many wrong codes?
  const locked = await codeLockSeconds(bucket);
  if (locked > 0) return { ok: false, error: `Too many incorrect codes. Try again in ${lockMinutes(locked)}.` };

  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses, active")
    .eq("code", c)
    .maybeSingle();
  if (error) console.error("[signup] invite lookup error:", error);

  // The gate consumes a use at entry and leaves the claim in a cookie — the
  // visitor who spent the use must still be allowed through even though the
  // code now reads as exhausted.
  const claimed = (await cookies()).get("klimr_invite")?.value?.toUpperCase() === c;
  if (invite && invite.active && claimed) return { ok: true };
  if (!invite || !invite.active || invite.uses >= invite.max_uses) {
    const lockNow = await noteCodeFailure(bucket);
    if (lockNow > 0) return { ok: false, error: `Too many incorrect codes. Try again in ${lockMinutes(lockNow)}.` };
    return { ok: false, error: "That invite code is not valid or has been fully used. Check it and try again, or write hello@klimr.com." };
  }

  await clearCodeAttempts(bucket);
  return { ok: true };
}
