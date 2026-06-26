import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// 5 wrong invite codes within 15 minutes → locked for 5 minutes. A correct code
// clears the counter. Shared across the /gate portal and signup (same IP bucket).
export const CODE_MAX_FAILS = 5;
const WINDOW_SECONDS = 900; // 15 min accumulation window
const LOCK_SECONDS = 300; // 5 min lockout

/** Seconds remaining on a lockout for this bucket (0 = not locked). Fails open. */
export async function codeLockSeconds(bucket: string): Promise<number> {
  try {
    const { data, error } = await createAdminClient().rpc("code_lock_seconds", { p_bucket: bucket });
    if (error) {
      console.error("[lockout] check", error);
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (e) {
    console.error("[lockout] check threw", e);
    return 0;
  }
}

/** Record a wrong attempt. Returns lockout seconds remaining if now locked, else 0. */
export async function noteCodeFailure(bucket: string): Promise<number> {
  try {
    const { data, error } = await createAdminClient().rpc("note_code_failure", {
      p_bucket: bucket,
      p_max: CODE_MAX_FAILS,
      p_window_seconds: WINDOW_SECONDS,
      p_lock_seconds: LOCK_SECONDS,
    });
    if (error) {
      console.error("[lockout] note", error);
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (e) {
    console.error("[lockout] note threw", e);
    return 0;
  }
}

/** Clear the counter on a correct code. */
export async function clearCodeAttempts(bucket: string): Promise<void> {
  try {
    await createAdminClient().rpc("clear_code_attempts", { p_bucket: bucket });
  } catch (e) {
    console.error("[lockout] clear threw", e);
  }
}

/** "5 minutes" style helper for user-facing messages. */
export function lockMinutes(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}
