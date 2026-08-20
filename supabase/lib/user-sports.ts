import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SPORTS, SPORT_KEYS } from "@/lib/sports";

/** THE single source of truth for "which sports does this member play" —
 *  the sitewide scoping mechanism (Gabriel's spec: filters and options
 *  everywhere show ONLY the member's sports, expanding the moment they add
 *  one in Settings → Sports).
 *
 *  React cache() dedupes across the whole RSC tree: any number of server
 *  components can call this per request at the cost of ONE indexed query.
 *  Reads player_sports (active = true) — updated by onboarding and
 *  Settings → Sports, so every surface reflects changes immediately.
 *  Fallback: a member with zero active sports sees the full list (never
 *  brick a page). */
export const getUserSportKeys = cache(
  async (supabase: SupabaseClient<Database>, userId: string): Promise<string[]> => {
    const { data } = await supabase
      .from("player_sports")
      .select("sport_key")
      .eq("user_id", userId)
      .eq("active", true);
    const keys = [...new Set((data ?? []).map((r) => r.sport_key))].filter((k) => SPORT_KEYS.includes(k));
    return keys.length ? keys : [...SPORT_KEYS];
  },
);

/** The same, as full sport objects for rendering option lists. */
export async function getUserSportOptions(supabase: SupabaseClient<Database>, userId: string) {
  const keys = await getUserSportKeys(supabase, userId);
  const set = new Set(keys);
  return SPORTS.filter((s) => set.has(s.key));
}
