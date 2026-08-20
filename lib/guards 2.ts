import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** False if the user is suspended or banned. Used to gate write actions. */
export async function accountActive(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  // KFU-028: fail CLOSED. The previous form discarded the query error and read a
  // missing row as active, so a transient lookup failure granted write access to
  // a suspended member. The database gate (0279) is the authoritative control;
  // this keeps the app from showing a suspended member a working UI.
  const { data, error } = await supabase
    .from("profile_private")
    .select("account_status, suspended_until")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[guards] account status lookup failed", error.code, error.message);
    return false;
  }
  if (!data) return false;
  if (data.account_status !== "active") return false;
  if (data.suspended_until && new Date(data.suspended_until) > new Date()) return false;
  return true;
}
