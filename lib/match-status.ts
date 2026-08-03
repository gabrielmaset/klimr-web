/** Match display status — derived, reliable, and identical on every surface.
 *
 *  The DB `status` column holds the ORGANIZATIONAL state (open, full,
 *  cancelled, completed). Time does the rest: an "open" match whose start
 *  time has passed reads LIVE for its play window, then PLAYED — computed at
 *  render, no cron, so it can never lag or drift (the reported bug: expired
 *  matches still said "Scheduled"). Any surface that shows a match status
 *  MUST go through this helper.
 */

export type MatchDisplayStatus = {
  key: "cancelled" | "completed" | "live" | "played" | "open" | "full" | "scheduled";
  label: string;
};

/** How long a match is considered "live" after its start time. */
const PLAY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h — covers every Klimr sport's typical session

export function matchDisplayStatus(
  status: string | null | undefined,
  scheduledAt: string | null | undefined,
  now: Date = new Date(),
): MatchDisplayStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "cancelled") return { key: "cancelled", label: "Cancelled" };
  if (s === "completed") return { key: "completed", label: "Played" };

  if (scheduledAt) {
    const start = new Date(scheduledAt).getTime();
    if (Number.isFinite(start)) {
      const t = now.getTime();
      if (t >= start + PLAY_WINDOW_MS) return { key: "played", label: "Played" };
      if (t >= start) return { key: "live", label: "Live now" };
    }
  }

  if (s === "full") return { key: "full", label: "Full" };
  if (s === "open") return { key: "open", label: "Open" };
  return { key: "scheduled", label: "Scheduled" };
}

/** True while joining makes sense: organizationally open AND not already live/past. */
export function matchJoinable(status: string | null | undefined, scheduledAt: string | null | undefined): boolean {
  return matchDisplayStatus(status, scheduledAt).key === "open";
}
