import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Capacity snapshot for an event. Confirmed + pending hold a spot; waitlisted
 * entries don't. Effective capacity is the pooled total, or the sum of the
 * per-division caps. `open` is null when capacity is unlimited.
 */
export async function capacityState(client: Client, tournamentId: string): Promise<{ cap: number | null; taken: number; open: number | null }> {
  const { data: t } = await client.from("tournaments").select("capacity, format_config").eq("id", tournamentId).maybeSingle();
  const fc = (t?.format_config ?? {}) as { capacity_mode?: string };
  let cap: number | null = t?.capacity ?? null;
  if (fc.capacity_mode === "per_division") {
    const { data: divs } = await client.from("tournament_divisions").select("capacity").eq("tournament_id", tournamentId);
    const sum = (divs ?? []).reduce((a, d) => a + (d.capacity ?? 0), 0);
    cap = sum > 0 ? sum : null;
  }
  const [{ count: active }, { count: wait }] = await Promise.all([
    client.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", tournamentId).not("status", "in", "(withdrawn,declined)"),
    client.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", tournamentId).eq("status", "waitlisted"),
  ]);
  const taken = (active ?? 0) - (wait ?? 0);
  const open = cap == null ? null : Math.max(0, cap - taken);
  return { cap, taken, open };
}
