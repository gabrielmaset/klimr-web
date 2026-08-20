"use server";

import { createClient } from "@/lib/supabase/server";
import { mapsPointFromUrl, resolveEventPin, type LatLng, type ResolvedPin } from "@/lib/maps-url";

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

/** Form preview: run the SAME ladder the save path uses (link → description
 *  link → street address → venue text) so what the organizer sees while
 *  editing is exactly what the event page will pin. */
export async function resolveEventPinPreview(input: {
  url: string;
  venue: string;
  description: string;
}): Promise<ResolvedPin | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return resolveEventPin({
    locationUrl: String(input.url ?? "").trim() || null,
    description: String(input.description ?? "").slice(0, 6000) || null,
    venueText: String(input.venue ?? "").trim() || null,
  });
}
