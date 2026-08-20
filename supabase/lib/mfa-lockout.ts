import "server-only";
import { getPrivilegedClient } from "@/lib/privileged";
import { isLocked, nextFailureRow, type LockoutRow } from "@/lib/mfa-lockout-rules";

/** App-level TOTP lockout against the 0055 table (audit SEC-006 · D6 amended).
 *  The table is already in production; the auth-hook variant is
 *  Team/Enterprise-gated, so the same policy runs here, invoked from the
 *  server action that fronts every MFA verification. */
const TABLE = "mfa_failed_verification_attempts";

export async function secondsLockedOut(userId: string, factorId: string): Promise<number> {
  const admin = getPrivilegedClient({ reason: "auth:totp-lockout-check", actorId: userId });
  const { data } = await admin
    .from(TABLE)
    .select("failed_count, last_failed_at, locked_until")
    .eq("user_id", userId)
    .eq("factor_id", factorId)
    .maybeSingle();
  return isLocked((data as LockoutRow | null) ?? null);
}

export async function recordTotpFailure(userId: string, factorId: string): Promise<number> {
  const admin = getPrivilegedClient({ reason: "auth:totp-failure", actorId: userId });
  const { data } = await admin
    .from(TABLE)
    .select("failed_count, last_failed_at, locked_until")
    .eq("user_id", userId)
    .eq("factor_id", factorId)
    .maybeSingle();
  const next = nextFailureRow((data as LockoutRow | null) ?? null);
  await admin
    .from(TABLE)
    .upsert({ user_id: userId, factor_id: factorId, ...next }, { onConflict: "user_id,factor_id" });
  return next.locked_until ? isLocked(next) : 0;
}

export async function clearTotpFailures(userId: string, factorId: string): Promise<void> {
  const admin = getPrivilegedClient({ reason: "auth:totp-clear", actorId: userId });
  await admin.from(TABLE).delete().eq("user_id", userId).eq("factor_id", factorId);
}
