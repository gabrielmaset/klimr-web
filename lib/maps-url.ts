// lib/maps-url.ts — turn a Google Maps link into a precise { lat, lng }.
//
// Organizers often paste a Google Maps link as an event's location_url instead of
// a clean street address. The map embed geocodes the address text, so a vague
// "Santa Monica, CA" lands the pin on the city — not the exact meeting spot in the
// link. These helpers pull the real coordinate out of the link so the embed can
// drop the pin exactly where the organizer meant.

export type LatLng = { lat: number; lng: number };

const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

// Pull coordinates out of a *full* Google Maps URL (or any text containing one) —
// no network. Handles the common shapes, most precise first:
//   !3dLAT!4dLNG   (the data pin embedded in place URLs)
//   /@LAT,LNG      (map centre)
//   q=/query=/ll=/sll=/center=/destination=  LAT,LNG
export function parseLatLngFromMapsUrl(raw: string | null | undefined): LatLng | null {
  if (!raw) return null;
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    s = raw;
  }

  const bang = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) {
    const lat = parseFloat(bang[1]);
    const lng = parseFloat(bang[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }

  const at = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    const lat = parseFloat(at[1]);
    const lng = parseFloat(at[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }

  const kv = s.match(/[?&#](?:q|query|ll|sll|center|destination|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (kv) {
    const lat = parseFloat(kv[1]);
    const lng = parseFloat(kv[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

const SHORT_HOSTS = new Set(["goo.gl", "maps.app.goo.gl", "app.goo.gl", "g.co"]);

// Is this one of Google's shortened share links (which carry no coordinates until
// they're expanded)?
export function isMapsShortLink(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return SHORT_HOSTS.has(host);
  } catch {
    return false;
  }
}

// Server-only: follow a short link and dig the precise coordinate out of the
// resolved URL or the returned HTML. Cached for a day; always fails soft to null
// (the map then falls back to the address text) and never throws. This runs at
// request time on the server — it needs outbound access to google, so it is a
// no-op anywhere that can't reach the network.
export async function resolveMapsShortLink(raw: string | null | undefined): Promise<LatLng | null> {
  if (!raw || !isMapsShortLink(raw)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(raw, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; KlimrBot/1.0; +https://klimr.com)" },
      next: { revalidate: 86400 },
    });
    // The final URL after redirects usually carries the coordinates.
    const fromUrl = parseLatLngFromMapsUrl(res.url);
    if (fromUrl) return fromUrl;
    // Otherwise scan the returned HTML for an embedded maps URL / coordinate.
    const body = await res.text();
    return parseLatLngFromMapsUrl(body.slice(0, 300_000));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Convenience for server components: parse first (cheap), then resolve a short
// link if needed. Returns the best precise point we can get, or null.
export async function mapsPointFromUrl(raw: string | null | undefined): Promise<LatLng | null> {
  const direct = parseLatLngFromMapsUrl(raw);
  if (direct) return direct;
  if (isMapsShortLink(raw)) return resolveMapsShortLink(raw);
  return null;
}
