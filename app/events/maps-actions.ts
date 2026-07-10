"use server";

import { createClient } from "@/lib/supabase/server";
import { mapsPointFromUrl, type LatLng } from "@/lib/maps-url";

/** Resolve a pasted Google Maps link to a precise point — including short
 *  links, which need a server-side redirect follow. Fails soft to null. */
export async function resolveMapsPoint(url: string): Promise<LatLng | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return mapsPointFromUrl(String(url ?? "").trim() || null);
}
