/** Pure TOTP-lockout window math (audit SEC-006 · D6 amended · K1-02).
 *  Mirrors migration 0055's hook logic exactly — 5 wrong codes inside
 *  15 minutes locks the factor for 15 minutes; a correct code clears —
 *  because the Supabase-side hook turned out to be Team/Enterprise-gated,
 *  the same policy now runs in the app layer against the same table. */
export const LOCKOUT_WINDOW_MS = 15 * 60_000;
export const LOCKOUT_COOLDOWN_MS = 15 * 60_000;
export const LOCKOUT_MAX_FAILURES = 5;

export type LockoutRow = {
  failed_count: number;
  last_failed_at: string; // ISO
  locked_until: string | null; // ISO
};

export function isLocked(row: LockoutRow | null, now: number = Date.now()): number {
  if (!row?.locked_until) return 0;
  const until = Date.parse(row.locked_until);
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

/** Next row state after a FAILED attempt. */
export function nextFailureRow(row: LockoutRow | null, now: number = Date.now()): LockoutRow {
  const windowLapsed = !row || now - Date.parse(row.last_failed_at) > LOCKOUT_WINDOW_MS;
  const count = windowLapsed ? 1 : row.failed_count + 1;
  return {
    failed_count: count,
    last_failed_at: new Date(now).toISOString(),
    locked_until: count >= LOCKOUT_MAX_FAILURES ? new Date(now + LOCKOUT_COOLDOWN_MS).toISOString() : null,
  };
}
