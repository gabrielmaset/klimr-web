import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ROLLING_WEEKS, ROLLING_BEST } from "@/lib/ranking";

type Admin = SupabaseClient<Database>;

/**
 * Recompute a player's per-sport ranking points from every points ledger — tournament
 * finishes AND pickup queue matches — as the sum of their best ROLLING_BEST results
 * inside the rolling window. This is the single place player_sports.points is written,
 * so the tournament award and the queue award stay consistent and old results age out.
 *
 * Only `points` is set here; matches_played / wins are owned by their own writers and
 * are left untouched (the upsert only touches the columns it passes).
 */
export async function recomputePlayerPoints(admin: Admin, userId: string, sportKey: string): Promise<void> {
  const cutoff = new Date(Date.now() - ROLLING_WEEKS * 7 * 24 * 3600 * 1000).toISOString();
  // The global best-N can include at most ROLLING_BEST rows from either ledger, so
  // pulling the top ROLLING_BEST from each is sufficient — and keeps reads bounded even
  // for very active players.
  const [tp, qp] = await Promise.all([
    admin.from("tournament_points").select("points").eq("user_id", userId).eq("sport_key", sportKey).gte("earned_at", cutoff).order("points", { ascending: false }).limit(ROLLING_BEST),
    admin.from("queue_points").select("points").eq("user_id", userId).eq("sport_key", sportKey).gte("earned_at", cutoff).order("points", { ascending: false }).limit(ROLLING_BEST),
  ]);
  const total = [...(tp.data ?? []), ...(qp.data ?? [])]
    .map((r) => r.points ?? 0)
    .sort((a, b) => b - a)
    .slice(0, ROLLING_BEST)
    .reduce((s, x) => s + x, 0);
  await admin.from("player_sports").upsert({ user_id: userId, sport_key: sportKey, points: total, updated_at: new Date().toISOString() }, { onConflict: "user_id,sport_key" });
}
