import { codes, lookup, type ZipRecord } from "zipcodes";

/* ------------------------------------------------------------------ *
 * Local US place lookups (no network).
 *
 * Backed by the `zipcodes` dataset (~44k US ZIPs with city/state/lat/lng).
 * Powers ZIP validation and city autocomplete for the court search, and
 * geocodes a ZIP/city to a centroid — all free, offline, and instant, which
 * replaces the per-ZIP Google Geocoding call we used to make.
 *
 * Server-only: only import this from server actions, never a client component.
 * ------------------------------------------------------------------ */

export type ZipHit = { zip: string; lat: number; lng: number; city: string; state: string };
export type CityHit = { key: string; label: string; city: string; state: string; cityLower: string; lat: number; lng: number };

/** Validate + geocode a 5-digit US ZIP. Returns null if it isn't a real ZIP. */
export function lookupZip(zip: string): ZipHit | null {
  const z = String(zip).trim();
  if (!/^\d{5}$/.test(z)) return null;
  const r: ZipRecord | undefined = lookup(z);
  if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
  return { zip: r.zip, lat: r.latitude, lng: r.longitude, city: r.city, state: r.state };
}

// Single-zone states; the rest (TX, KS, NE, the Dakotas, ID, KY) straddle a zone
// line and are resolved by longitude instead.
const TZ_EASTERN = new Set(["CT","DE","DC","FL","GA","ME","MD","MA","MI","NH","NJ","NY","NC","OH","PA","RI","SC","VT","VA","WV","IN"]);
const TZ_CENTRAL = new Set(["AL","AR","IL","IA","LA","MN","MS","MO","OK","WI","TN"]);
const TZ_MOUNTAIN = new Set(["CO","MT","NM","UT","WY"]);
const TZ_PACIFIC = new Set(["CA","WA","NV","OR"]);

/** Best-effort IANA timezone for a US state + longitude. Used so we can default
 *  an event's time zone from its ZIP without asking the organizer. Approximate
 *  near zone borders; times are stored as absolute timestamps regardless. */
export function tzFromStateLng(state: string, lng: number): string {
  const s = (state || "").toUpperCase();
  if (s === "AK") return "America/Anchorage";
  if (s === "HI") return "Pacific/Honolulu";
  if (s === "AZ") return "America/Phoenix"; // most of Arizona observes no DST
  if (TZ_PACIFIC.has(s)) return "America/Los_Angeles";
  if (TZ_MOUNTAIN.has(s)) return "America/Denver";
  if (TZ_CENTRAL.has(s)) return "America/Chicago";
  if (TZ_EASTERN.has(s)) return "America/New_York";
  if (lng >= -87.5) return "America/New_York";
  if (lng >= -101.0) return "America/Chicago";
  if (lng >= -115.0) return "America/Denver";
  return "America/Los_Angeles";
}

/** Resolve a ZIP straight to an IANA timezone (null if not a real ZIP). */
export function zipTimezone(zip: string): string | null {
  const z = lookupZip(zip);
  return z ? tzFromStateLng(z.state, z.lng) : null;
}

type CityAcc = { key: string; city: string; state: string; cityLower: string; sumLat: number; sumLng: number; n: number };

// Built once, lazily, then cached for the life of the process.
let _index: { byKey: Map<string, CityHit>; list: CityHit[]; count: Map<string, number> } | null = null;

function buildIndex() {
  const acc = new Map<string, CityAcc>();
  for (const zip of Object.keys(codes)) {
    const r = codes[zip];
    if (!r || !r.city || !r.state) continue;
    if (typeof r.latitude !== "number" || typeof r.longitude !== "number") continue;
    const key = `${r.city.toLowerCase()}|${r.state.toLowerCase()}`;
    const e = acc.get(key);
    if (e) {
      e.sumLat += r.latitude;
      e.sumLng += r.longitude;
      e.n += 1;
    } else {
      acc.set(key, { key, city: r.city, state: r.state, cityLower: r.city.toLowerCase(), sumLat: r.latitude, sumLng: r.longitude, n: 1 });
    }
  }
  const list: CityHit[] = [];
  const byKey = new Map<string, CityHit>();
  const count = new Map<string, number>();
  for (const e of acc.values()) {
    const hit: CityHit = { key: e.key, label: `${e.city}, ${e.state}`, city: e.city, state: e.state, cityLower: e.cityLower, lat: e.sumLat / e.n, lng: e.sumLng / e.n };
    list.push(hit);
    byKey.set(e.key, hit);
    count.set(e.key, e.n);
  }
  // Pre-sort by ZIP count (a decent free population proxy), then alphabetically,
  // so the most prominent same-name city surfaces first (e.g. Austin, TX before Austin, MN).
  list.sort((a, b) => (count.get(b.key)! - count.get(a.key)!) || a.city.localeCompare(b.city));
  _index = { byKey, list, count };
  return _index;
}

function index() {
  return _index ?? buildIndex();
}

/** Prefix-match US cities by name. Exact-name matches (across states) rank first. */
export function suggestCities(query: string, limit = 7): CityHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const { list } = index();
  const exact: CityHit[] = [];
  const prefix: CityHit[] = [];
  for (const c of list) {
    if (c.cityLower === q) exact.push(c);
    else if (c.cityLower.startsWith(q)) prefix.push(c);
  }
  return [...exact, ...prefix].slice(0, limit);
}

export function cityByKey(key: string): CityHit | null {
  return index().byKey.get(key.trim().toLowerCase()) ?? null;
}

/** Resolve a search key (a 5-digit ZIP or a "city|state" key) to a centroid. */
export function resolveLocation(key: string): { key: string; label: string; lat: number; lng: number } | null {
  const k = String(key).trim();
  if (/^\d{5}$/.test(k)) {
    const z = lookupZip(k);
    return z ? { key: z.zip, label: `${z.city}, ${z.state}`, lat: z.lat, lng: z.lng } : null;
  }
  const c = cityByKey(k);
  return c ? { key: c.key, label: c.label, lat: c.lat, lng: c.lng } : null;
}

/** Great-circle distance in miles between two lat/lng points (Haversine). */
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
