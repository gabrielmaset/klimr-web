import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** False if the user is suspended or banned. Used to gate write actions. */
export async function accountActive(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("account_status").eq("id", userId).single();
  return !data || data.account_status === "active";
}
