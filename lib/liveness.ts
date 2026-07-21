// Event Pulse — liveness constants, types, and display helpers.
//
// Rule version 1 (shadow). The visible product rule is "three strikes":
// three consecutive evidence-empty occurrences move a recurring, queue-enabled
// series to dormant (shadow column only until the auto-dormancy flag ships).
// Monthly series additionally require ≥75 days without verified evidence.
// The first two closed occurrences of any series are exempt (cold starts
// aren't ghosts), skipped/cancelled dates never count, and the whole job
// halts under the `event_liveness_paused` circuit breaker. Evidence comes
// from queue truth — member joins, walk-in guest joins (no RSVP ever
// required), and matches — tallied set-based at occurrence close after an
// 18-hour finalization grace so offline entries land first.
//
// All thresholds live here so tuning them later never requires a migration.

export const LIVENESS_RULE_VERSION = 1;
export const STRIKES_TO_DORMANT = 3;
export const FINALIZATION_GRACE_HOURS = 18;
export const MONTHLY_MIN_QUIET_DAYS = 75;
export const NEW_SERIES_EXEMPT_OCCURRENCES = 2;
export const ARCHIVE_AFTER_DORMANT_MONTHS = 6; // applied in a later slice

export type OccurrenceStatus =
  | "scheduled"
  | "organizer_confirmed"
  | "skipped"
  | "cancelled"
  | "in_progress"
  | "evidence_pending"
  | "completed_with_evidence"
  | "completed_empty"
  | "disputed";

export type LivenessStatus = "active" | "watch" | "dormant" | "archived";
export type OrganizerState = "active" | "paused" | "ended";

export const LIVENESS_LABEL: Record<LivenessStatus, string> = {
  active: "Active",
  watch: "Watch",
  dormant: "Dormant",
  archived: "Archived",
};

export const LIVENESS_TONE: Record<LivenessStatus, string> = {
  active: "var(--color-success)",
  watch: "var(--color-warning)",
  dormant: "var(--color-brand-deep)",
  archived: "var(--color-mute)",
};

export const OCCURRENCE_LABEL: Record<OccurrenceStatus, string> = {
  scheduled: "Scheduled",
  organizer_confirmed: "Confirmed",
  skipped: "Skipped",
  cancelled: "Cancelled",
  in_progress: "In progress",
  evidence_pending: "Evidence pending",
  completed_with_evidence: "Played",
  completed_empty: "Ran empty",
  disputed: "Disputed",
};

export const REASON_LABEL: Record<string, string> = {
  evidence_found: "Verified activity recorded",
  no_evidence: "No verified activity",
  three_strikes: "Three consecutive empty occurrences",
  empty_streak: "Empty occurrence — watching",
  evidence_resumed: "Verified activity resumed",
  dormant_six_months: "Dormant six months — archived",
  organizer_skip: "Organizer skipped the date",
  organizer_unskip: "Organizer restored the date",
  organizer_pause: "Organizer paused the series",
  organizer_resume: "Organizer resumed the series",
  organizer_end: "Organizer ended the series",
  pause_window: "Inside a pause window — skipped",
  pause_window_ended: "Pause window ended — resumed",
};

/** Privacy-safe public rendering of a verified count (plan v2 §2.6):
 *  <4 suppressed · 4–9 as a range · ≥10 exact. Returns null when suppressed. */
export function publicAttendanceLabel(verified: number): string | null {
  if (verified < 4) return null;
  if (verified < 10) return "5–9 played";
  return `${verified} played`;
}
