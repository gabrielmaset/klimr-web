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
export type QTeam = { id: string; members: QMember[]; wins: number; hold: boolean; size: number; count: number };

export type QCourtState = {
  id: string;
  label: string;
  teamSize: number;
  levels: string[];
  current: { matchId: string; startedAt: string; a: QTeam; b: QTeam } | null;
  queue: QTeam[]; // queued teams in play order (holder first if a winner is staying)
  forming: QTeam[]; // teams still filling — open to join
};

export type QPending = { id: string; courtId: string; name: string; isGuest: boolean };

export type QSessionState = {
  session: {
    id: string;
    code: string;
    title: string;
    sportKey: string;
    status: string;
    winCap: number;
    allowGuests: boolean;
    requireLocation: boolean;
    eventOnly: boolean;
    requireApproval: boolean;
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
