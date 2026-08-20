import "server-only";
import { createClient } from "@/lib/supabase/server";

type SB = Awaited<ReturnType<typeof createClient>>;

export type Side = {
  points: number;
  wins: number;
  players: number;
  top: { user_id: string; points: number; wins: number }[];
};

/**
 * A region's live standing in a challenge: the combined points/wins of players whose
 * home area (neighborhood or city, per scope) matches, for the given sport. Exact match
 * on the area string. Returns the top contributors by points.
 */
export async function computeSide(supabase: SB, scope: string, region: string, sportKey: string): Promise<Side> {
  const col = scope === "city" ? "city" : "neighborhood";
  const { data: profs } = await supabase.from("profiles").select("id").eq(col, region);
  const ids = (profs ?? []).map((p) => p.id);
  if (!ids.length) return { points: 0, wins: 0, players: 0, top: [] };

  const { data: ps } = await supabase
    .from("player_sports")
    .select("user_id, points, wins")
    .eq("sport_key", sportKey)
    .in("user_id", ids);
  const rows = ps ?? [];

  let points = 0;
  let wins = 0;
  for (const r of rows) {
    points += r.points ?? 0;
    wins += r.wins ?? 0;
  }
  const top = [...rows]
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3)
    .map((r) => ({ user_id: r.user_id, points: r.points ?? 0, wins: r.wins ?? 0 }));

  return { points, wins, players: rows.length, top };
}

/** Percentage split of A's points vs B's (defaults to 50/50 when neither side has points). */
export function splitPct(aPoints: number, bPoints: number): number {
  const total = aPoints + bPoints;
  if (total <= 0) return 50;
  return Math.round((aPoints / total) * 100);
}
