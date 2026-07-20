// Shared constants, pure helpers, and the live-state shape for the court queue.
// No server-only imports here — both client components and server code use this.

export const LEVELS = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
] as const;
export type LevelKey = (typeof LEVELS)[number]["key"];

// Team sizes offered in setup (3 = 3v3, 4 = 4v4, ...). 1 = singles / king-of-court 1s.
export const FORMATIONS = [1, 2, 3, 4, 5, 6] as const;

/** Valid on-court formations per sport (there's no 1v1 beach volleyball, padel is doubles-only, etc.). */
export const SPORT_FORMATIONS: Record<string, number[]> = {
  tennis: [1, 2],
  pickleball: [1, 2],
  padel: [2],
  racquetball: [1, 2, 3],
  beach_volleyball: [2, 3, 4, 5, 6],
};
export function formationsFor(sportKey: string): number[] {
  return SPORT_FORMATIONS[sportKey] ?? [1, 2, 3, 4];
}

export function levelLabel(k: string): string {
  return LEVELS.find((l) => l.key === k)?.label ?? k;
}

export function formationLabel(size: number): string {
  return `${size}v${size}`;
}

/** Great-circle distance in meters (haversine). */
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Milliseconds → "M:SS" (or "H:MM:SS" past an hour). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// ----- live-state shape (returned by the polling route + initial SSR) -----

export type QMember = { name: string; isGuest: boolean; you: boolean };
export type QTeam = { id: string; members: QMember[]; wins: number; hold: boolean; size: number; count: number; queuedAt: string | null };

/** Organizer-chosen team display name. Pure + client-safe; falls back to the
 *  letter whenever members can't produce a name (empty team, blank names). */
export function teamDisplayName(
  mode: "letters" | "first_player" | "initials",
  side: string,
  team: QTeam | null | undefined,
): string {
  const fallback = `Team ${side}`;
  if (!team || mode === "letters") return fallback;
  const names = team.members.map((m) => m.name.trim()).filter(Boolean);
  if (!names.length) return fallback;
  if (mode === "first_player") return names[0].split(/\s+/)[0] || fallback;
  const initials = names.map((n) => n[0].toUpperCase()).join("\u00b7");
  return initials || fallback;
}

export type QCourtState = {
  id: string;
  label: string;
  teamSize: number;
  levels: string[];
  current: { matchId: string; startedAt: string; a: QTeam; b: QTeam } | null;
  queue: QTeam[]; // queued teams in play order (holder first if a winner is staying)
  forming: QTeam[]; // teams still filling — open to join
  closed: boolean; // organizer retired this court (end-of-day wind-down)
};

export type QPending = { id: string; courtId: string; name: string; isGuest: boolean };

export type QSessionState = {
  session: {
    id: string;
    eventId: string | null;
    tournamentId: string | null;
    teamNameMode: "letters" | "first_player" | "initials";
    displayCode: string | null;
    code: string;
    title: string;
    sportKey: string;
    status: string;
    winCap: number;
    allowGuests: boolean;
    requireLocation: boolean;
    eventOnly: boolean;
    requireApproval: boolean;
    allowFullTeams: boolean;
    paused: boolean;
    pausedByName: string | null;
    centerLat: number | null;
    centerLng: number | null;
    radiusM: number;
    organizerId: string;
  };
  courts: QCourtState[];
  // people waiting for the organizer to approve them (organizer view)
  pending: QPending[];
  // the requesting user's spot, if they're in a team
  me: { teamId: string; courtId: string; status: string; place: number | null } | null;
  // the requesting user's outstanding join request, if any
  myPending: { id: string; courtId: string } | null;
};

/** Uppercase, alphanumeric, max 7 — a 6-char session code, optionally plus a
 *  court digit ("ABC1234" = code ABC123, court 4). */
export function cleanQueueCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function splitQueueCode(v: string): { code: string; court: number | null } {
  if (v.length === 7) {
    const n = Number(v[6]);
    if (n >= 1 && n <= 9) return { code: v.slice(0, 6), court: n };
  }
  return { code: v.slice(0, 6), court: null };
}

/** Human distance, Google-Maps style. Imperial: feet under a mile (nearest
 *  50 ft ≥ 100, nearest 10 below — 150 m reads "500 ft"), miles above (one
 *  decimal under 10). Metric mirrors it: meters nearest 10, km past 1000. */
export function formatDistance(meters: number, imperial: boolean): string {
  if (imperial) {
    const ft = meters * 3.28084;
    if (ft >= 5280) {
      const mi = ft / 5280;
      return `${mi >= 10 ? Math.round(mi) : Math.round(mi * 10) / 10} mi`;
    }
    const r = ft < 100 ? Math.max(10, Math.round(ft / 10) * 10) : Math.round(ft / 50) * 50;
    return `${r} ft`;
  }
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km >= 10 ? Math.round(km) : Math.round(km * 10) / 10} km`;
  }
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}

/** Imperial-preferring regions (US, Liberia, Myanmar) from a locale or
 *  Accept-Language string; everyone else — current and future markets —
 *  gets metric. */
export function prefersImperial(localeish: string | null | undefined): boolean {
  const first = (localeish ?? "").split(",")[0]?.trim() ?? "";
  return /-(US|LR|MM)\b/i.test(first);
}
