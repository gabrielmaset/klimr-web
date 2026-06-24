import type { Json } from "@/lib/database.types";

export type FormatType = "round_robin" | "pools_knockout" | "single_elim";

export const FORMAT_LABEL: Record<FormatType, string> = {
  round_robin: "Round robin",
  pools_knockout: "Pools + knockout",
  single_elim: "Single elimination",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};

export type PublishedScheduleRow = { court: string; time: string | null; division: string; pool: string | null; a: string; b: string };
export type PublishedSchedule = { builtAt: string; mode: string; rows: PublishedScheduleRow[] };

export type PublishedStandingRow = { rank: number; team: string; w: number; l: number; d: number; diff: number };
export type PublishedPool = { name: string; rows: PublishedStandingRow[] };
export type PublishedBracketMatch = { a: string; b: string; sa: number | null; sb: number | null; done: boolean };
export type PublishedBracketRound = { label: string; matches: PublishedBracketMatch[] };
export type PublishedResultsDivision = { name: string; pools: PublishedPool[]; rounds: PublishedBracketRound[] };
export type PublishedResults = { builtAt: string; format: string; divisions: PublishedResultsDivision[] };

export type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type Sponsor = {
  id: string;
  name: string;
  url?: string | null;
  tier: "premium" | "standard";
  logo?: string | null;
  photos?: string[]; // premium only, up to 3
  blurb?: string | null;
};

export type TournamentFormatConfig = {
  format_type?: FormatType;
  pool_count?: number;
  roster_size?: number;
  court_count?: number;
  courts?: string[];
  matches_start_at?: string | null;
  schedule_mode?: "timed" | "ordered";
  match_length_min?: number;
  schedule_built_at?: string | null;
  schedule_published?: boolean;
  published_schedule?: PublishedSchedule;
  results_published?: boolean;
  results_auto_publish?: boolean;
  published_results?: PublishedResults;
  signup_form_ready?: boolean;
  sponsors?: Sponsor[];
  announcements?: Announcement[];
  gallery?: string[];
  capacity_mode?: "pooled" | "per_division";
  capacity_unit?: "team" | "person";
  legal?: {
    waiver_text?: string;
    rules_text?: string;
    require_waiver?: boolean;
    require_rules?: boolean;
  };
};

// Whitelisted set of editable fields the setup wizard can patch.
export type TournamentDraftPatch = {
  title?: string;
  summary?: string | null;
  description?: string | null;
  sport_key?: string;
  entry_type?: string;
  visibility?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  zip?: string; // transient — resolved server-side to location_lat/lng for local discovery
  weather_enabled?: boolean;
  capacity?: number | null;
  reserves_allowed?: number;
  min_women?: number;
  min_men?: number;
  registration_opens_at?: string | null;
  registration_deadline?: string | null;
  format_config?: Json;
};

// <input type="datetime-local"> works in local time; the DB stores timestamptz.
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type DivisionRow = {
  id: string;
  name: string;
  description: string | null;
  fee_cents: number;
  fee_basis: string;
  capacity: number | null;
  sort_order: number;
};

export type DivisionInput = {
  id?: string;
  name: string;
  description?: string | null;
  fee_cents: number;
  fee_basis: string;
  capacity?: number | null;
  sort_order: number;
};

export function formatFee(feeCents: number, basis: string): string {
  if (!feeCents) return "Free";
  const dollars = (feeCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
  return `${dollars} / ${basis === "per_player" ? "player" : "team"}`;
}

export type CustomFieldRow = {
  id: string;
  label: string;
  description: string | null;
  field_type: string;
  options: string[];
  required: boolean;
  scope: string;
  sort_order: number;
};

export type CustomFieldInput = {
  id?: string;
  label: string;
  description?: string | null;
  field_type: string;
  options: string[];
  required: boolean;
  scope: string;
  sort_order: number;
};

export const FIELD_TYPE_LABEL: Record<string, string> = {
  short_text: "Short text",
  long_text: "Paragraph",
  single_select: "Single choice",
  multi_select: "Multiple choice",
  number: "Number",
  date: "Date",
};

export function fieldTypeHasOptions(type: string): boolean {
  return type === "single_select" || type === "multi_select";
}

// ---- Competition: pool standings ----------------------------------------

export const PLAN_KINDS = ["general", "games", "food", "sponsor", "music", "setup", "ceremony", "staff"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
export const PLAN_KIND_LABEL: Record<string, string> = {
  general: "General",
  games: "Games",
  food: "Food & drink",
  sponsor: "Sponsors",
  music: "Music / DJ",
  setup: "Setup",
  ceremony: "Ceremony",
  staff: "Staff",
};
export type PlanItemRow = {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
  ends_at: string | null;
  notes: string | null;
  sort_order: number;
};
export type PlanItemInput = {
  id?: string;
  title: string;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  sort_order: number;
};

export type StandingRow = {
  regId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pf: number;
  pa: number;
  diff: number;
};

export type StandingMatch = {
  entryA: string | null;
  entryB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
};

/** Whether the sign-up form has been set up enough to publish. Either the
 *  organizer saved the form at least once (which sets signup_form_ready) or the
 *  event already has questions (grandfathers events created before this gate). */
export function isSignupFormReady(fc: { signup_form_ready?: boolean }, fieldCount: number): boolean {
  return fc.signup_form_ready === true || fieldCount > 0;
}

/** Whether public sign-ups are currently open. Date-driven: a published event
 *  opens automatically once its registration-opens time arrives and stays open
 *  until the deadline. A manual "registration_open" status forces it open until
 *  the deadline; any other status (draft, closed, completed…) is closed. */
export function isRegistrationOpen(
  t: { status: string; registration_opens_at?: string | null; registration_deadline?: string | null },
  now: number = Date.now(),
): boolean {
  const deadline = t.registration_deadline ? new Date(t.registration_deadline).getTime() : null;
  if (deadline !== null && now > deadline) return false;
  if (t.status === "registration_open") return true;
  if (t.status === "published") {
    const opensAt = t.registration_opens_at ? new Date(t.registration_opens_at).getTime() : null;
    if (opensAt !== null && now >= opensAt) return true;
  }
  return false;
}

/** Compute pool standings from completed matches. Ranked by wins, then point
 *  differential, then points-for, then name. Pure — safe on client or server. */
export function computePoolStandings(entries: { regId: string; name: string }[], matches: StandingMatch[]): StandingRow[] {
  const map = new Map<string, StandingRow>();
  for (const e of entries) map.set(e.regId, { regId: e.regId, name: e.name, played: 0, wins: 0, losses: 0, draws: 0, pf: 0, pa: 0, diff: 0 });
  for (const m of matches) {
    if (m.status !== "completed" || !m.entryA || !m.entryB || m.scoreA == null || m.scoreB == null) continue;
    const a = map.get(m.entryA);
    const b = map.get(m.entryB);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.pf += m.scoreA;
    a.pa += m.scoreB;
    b.pf += m.scoreB;
    b.pa += m.scoreA;
    if (m.scoreA > m.scoreB) {
      a.wins++;
      b.losses++;
    } else if (m.scoreB > m.scoreA) {
      b.wins++;
      a.losses++;
    } else {
      a.draws++;
      b.draws++;
    }
  }
  const rows = [...map.values()];
  for (const r of rows) r.diff = r.pf - r.pa;
  rows.sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.pf - x.pf || x.name.localeCompare(y.name));
  return rows;
}
