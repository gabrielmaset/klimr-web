"use server";

import { createClient } from "@/lib/supabase/server";
import { lookupZip, suggestCities } from "@/lib/us-places";

export type AreaHit = { lat: number; lng: number; label: string };

/** Resolve a typed city or 5-digit ZIP to a centroid — free, offline, local
 *  US dataset (the same one the courts search uses). */
export async function resolveEventArea(q: string): Promise<AreaHit | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const query = String(q ?? "").trim();
  if (!query) return null;
  if (/^\d{5}$/.test(query)) {
    const z = lookupZip(query);
    return z ? { lat: z.lat, lng: z.lng, label: `${z.city}, ${z.state} ${z.zip}` } : null;
  }
  const c = suggestCities(query, 1)[0];
  return c ? { lat: c.lat, lng: c.lng, label: c.label } : null;
}
