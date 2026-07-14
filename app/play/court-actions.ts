"use server";

import { createClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/us-places";

export type CourtHit = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  distanceMi: number | null;
};

const R = 3958.8;
function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Court search for the Play filter: a 5-digit query is treated as a ZIP
 *  (courts nearest that ZIP); anything else matches name or city. Distances
 *  are relative to the viewer's home ZIP when known. */
export async function searchCourts(q: string, sport: string | null): Promise<CourtHit[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const query = q.trim();
  if (query.length < 2) return [];

  const { data: prof } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();
  const home = prof?.home_zip ? lookupZip(prof.home_zip) : null;

  if (/^\d{5}$/.test(query)) {
    const z = lookupZip(query);
    if (!z) return [];
    const dLat = 0.22, dLng = 0.26;
    let zq = supabase
      .from("courts")
      .select("id, name, city, state, zip, lat, lng")
      .not("lat", "is", null)
      .gte("lat", z.lat - dLat)
      .lte("lat", z.lat + dLat)
      .gte("lng", z.lng - dLng)
      .lte("lng", z.lng + dLng)
      .limit(60);
    if (sport) zq = zq.contains("sports", [sport]);
    const { data: cs } = await zq;
    return (cs ?? [])
      .map((c) => ({ c, d: miles({ lat: z.lat, lng: z.lng }, { lat: c.lat!, lng: c.lng! }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map(({ c }) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        state: c.state,
        zip: c.zip,
        distanceMi: home && c.lat != null && c.lng != null ? Math.round(miles({ lat: home.lat, lng: home.lng }, { lat: c.lat, lng: c.lng }) * 10) / 10 : null,
      }));
  }

  const esc = query.replace(/[%_]/g, "");
  let nq = supabase
    .from("courts")
    .select("id, name, city, state, zip, lat, lng")
    .or(`name.ilike.%${esc}%,city.ilike.%${esc}%`)
    .limit(12);
  if (sport) nq = nq.contains("sports", [sport]);
  const { data: cs } = await nq;
  return (cs ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    state: c.state,
    zip: c.zip,
    distanceMi: home && c.lat != null && c.lng != null ? Math.round(miles({ lat: home.lat, lng: home.lng }, { lat: c.lat, lng: c.lng }) * 10) / 10 : null,
  }));
}
