"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PRESENCE_MODES, type PresenceMode } from "./presence";

/**
 * Persist the signed-in user's chosen presence mode. Used by the quick toggle
 * in the top bar and by the Settings control — both call this.
 */
export async function setPresenceMode(mode: PresenceMode): Promise<{ ok: boolean; mode?: PresenceMode }> {
  if (!PRESENCE_MODES.includes(mode)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from("profiles").update({ presence_mode: mode }).eq("id", user.id);
  if (error) return { ok: false };

  // Refresh the shell so the sidebar avatar dot + top-bar pill reflect the change.
  revalidatePath("/", "layout");
  return { ok: true, mode };
}
