// Milestone-bucket analytics — Gabriel's confirmed rule (plan decision 15):
// businesses see MILESTONES, never raw counts. Below 100 nothing shows; then
// 100+ / 500+ / 1k+ / 5k+ / 25k+ / 50k+ / 100k+ / 500k+ / 1M+. Exact figures
// stay internal (server + admin). Every business-facing surface that reports
// reach or audience MUST go through formatMilestoneBucket — pages compute the
// bucket server-side and ship only the string, so exact numbers never reach
// the client for business views.

const THRESHOLDS: { min: number; label: string }[] = [
  { min: 1_000_000, label: "1M+" },
  { min: 500_000, label: "500k+" },
  { min: 100_000, label: "100k+" },
  { min: 50_000, label: "50k+" },
  { min: 25_000, label: "25k+" },
  { min: 5_000, label: "5k+" },
  { min: 1_000, label: "1k+" },
  { min: 500, label: "500+" },
  { min: 100, label: "100+" },
];

/** null below 100 — the surface shows nothing (or its own "growing" copy). */
export function formatMilestoneBucket(n: number): string | null {
  if (!Number.isFinite(n) || n < 100) return null;
  for (const t of THRESHOLDS) if (n >= t.min) return t.label;
  return null;
}

/** The next milestone a count is working toward (for honest "growing" copy). */
export function nextMilestone(n: number): number {
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (n < THRESHOLDS[i].min) return THRESHOLDS[i].min;
  }
  return 10_000_000;
}
