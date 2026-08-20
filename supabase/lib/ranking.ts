// Community ranking points earned from tournament finishes.
//
// These feed player_sports.points — the single number the rankings screen ranks by —
// as a rolling sum of a player's best results over the last year (see
// awardTournamentPoints). Everything here is a deterministic function of field size
// and finishing place: there are no organizer-set multipliers, so points can't be
// inflated by tilting a draw. Want a different curve? Tune the constants below — this
// is the only place the numbers live.

/** Only results from the last this-many weeks count toward a player's points. */
export const ROLLING_WEEKS = 52;
/** A player's best this-many results (within the window) are summed. */
export const ROLLING_BEST = 8;
/** A rostered sub whose participation wasn't confirmed earns this share. */
export const RESERVE_FACTOR = 0.5;

/** Pickup (King of the Court) match points. Casual matches are a modest on-ramp to the
 *  rankings: a win is worth a little, a loss still earns a small participation share.
 *  These land in the SAME rolling best-N pool as tournament finishes, so grinding pickup
 *  games can't out-earn real tournament results. Tune here — this is the only place. */
export const PICKUP_WIN_POINTS = 12;
export const PICKUP_LOSS_POINTS = 4;
export function pickupMatchPoints(won: boolean): number {
  return won ? PICKUP_WIN_POINTS : PICKUP_LOSS_POINTS;
}

/** The champion's haul scales with how many entries they had to beat, so winning a
 *  bigger, tougher draw is worth more — without any manual "tier" the organizer sets. */
export function champBase(fieldSize: number): number {
  return 50 + 25 * Math.max(1, fieldSize);
}

/** Points for finishing in `place` (1 = champion) within a field of `fieldSize`.
 *  Each bracket round survived is worth ~1.5x the round below it; everyone who has a
 *  result earns at least a small participation floor. */
export function placementPoints(place: number, fieldSize: number): number {
  const base = champBase(fieldSize);
  const band = place <= 1 ? 0 : Math.ceil(Math.log2(place));
  const factor = Math.pow(0.65, band);
  const floor = Math.round(base * 0.05);
  return Math.max(floor, Math.round(base * factor));
}

export type PlaceMatch = {
  round: number;
  entryA: string | null;
  entryB: string | null;
  winnerId: string | null;
  status: string;
};

/** Final placement for every team in a single-elimination bracket, derived from match
 *  results. Losers are placed by the round they went out (final → 2nd, semifinals →
 *  3rd, quarterfinals → 5th, …); the team that never loses is 1st. Byes are ignored.
 *  Returns a map of registration id → place. Teams still alive (no result yet) are
 *  simply absent. */
export function bracketPlaces(matches: PlaceMatch[]): Map<string, number> {
  const place = new Map<string, number>();
  const maxRound = matches.reduce((mx, m) => Math.max(mx, m.round), 0);
  if (maxRound === 0) return place;
  for (const m of matches) {
    if (m.status !== "completed" || !m.winnerId || !m.entryA || !m.entryB) continue;
    const loser = m.winnerId === m.entryA ? m.entryB : m.entryA;
    const p = Math.pow(2, maxRound - m.round) + 1;
    if (!place.has(loser)) place.set(loser, p);
  }
  const final = matches.find((m) => m.round === maxRound && m.status === "completed" && m.winnerId);
  if (final?.winnerId) place.set(final.winnerId, 1);
  return place;
}
