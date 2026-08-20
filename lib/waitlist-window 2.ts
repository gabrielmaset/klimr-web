/** Pure waitlist offer-window math (unit-tested; no server imports).
 *  How long a called-up player has to confirm, keyed to how soon the match
 *  starts: ≤4h → 20 min, ≤24h → 1h, further out (or anytime) → 4h. Extracted
 *  so CI can lock the thresholds without pulling the server-only engine. */
export function offerWindowMinutes(scheduledAt: string | null, atMs: number): number {
  if (!scheduledAt) return 240; // anytime matches: the generous window
  const hoursUntil = (Date.parse(scheduledAt) - atMs) / 3_600_000;
  if (hoursUntil <= 4) return 20;
  if (hoursUntil <= 24) return 60;
  return 240;
}
