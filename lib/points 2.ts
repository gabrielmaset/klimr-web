import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Admin = SupabaseClient<Database>;

/**
 * Recompute a player's per-sport ranking points from every points ledger —
 * tournament finishes AND pickup queue matches — as the sum of their best
 * ROLLING_BEST results inside the rolling window. This is the single place
 * `player_sports.points` is written, so the tournament award and the queue award
 * stay consistent and old results age out.
 *
 * KCDX-050. This used to read both ledgers from here and upsert the total. Both
 * reads were consumed as `result.data ?? []`, and a supabase-js read that ERRORS
 * returns `data: null` — so a transient failure on either ledger silently became
 * an empty ledger, and the resulting total was written as canonical. Quiet,
 * durable, and pointed at the one number the product is about.
 *
 * The computation now lives in `recompute_player_points` (0200): one statement,
 * one snapshot, both ledgers. That removes the partial-read case rather than
 * handling it, and closes the window between the two reads in which a new ledger
 * row produced a total that was never true at any instant.
 *
 * On failure this THROWS. Callers award points inside a larger operation, and a
 * ranking that silently stops updating is worse than an operation that fails
 * loudly and can be retried.
 */
export async function recomputePlayerPoints(admin: Admin, userId: string, sportKey: string): Promise<number> {
  const { data, error } = await admin.rpc("recompute_player_points", {
    p_user: userId,
    p_sport: sportKey,
  });
  if (error) {
    console.error(`[points] recompute failed for ${userId}/${sportKey}: ${error.message}`);
    throw new Error(`recompute_player_points failed: ${error.message}`);
  }
  return data ?? 0;
}
