/** Pure Google-Maps URL parsing (KCDX-039-adjacent, split out Aug 2026).
 *
 *  `lib/maps-url.ts` gained an egress-controlled HTTP client for KCDX-019, which
 *  imports `node:dns` and `node:https`. `components/event-form.tsx` is a client
 *  component and imports the PARSERS from that same module — so the production
 *  build failed with "the chunking context does not support external modules
 *  (request: node:dns)". The parsers were always pure; they just lived next to
 *  something that is not.
 *
 *  Everything here is string-in, value-out and safe on either side of the wire.
 *  `lib/maps-url.ts` re-exports it so existing server callers are unaffected. */

export type LatLng = { lat: number; lng: number };

export const validLatLng = (lat: number, lng: number) =>
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

  // Old-style goo.gl short links expand to a PATH-coordinate search URL:
  //   /maps/search/34.021018,+-118.510259?shorturl=1
  // — comma-PLUS separator (a literal '+', which decodeURIComponent never
  // touches). Found via the organizer re-check trace on a real event after
  // three blind fixes missed it; the coordinates were in the URL all along.
  const path = s.match(/\/maps\/(?:search|dir|place)\/(-?\d{1,2}(?:\.\d+)?),[+\s]*(-?\d{1,3}(?:\.\d+)?)(?=[/?,&]|$)/);
  if (path) {
    const lat = parseFloat(path[1]);
    const lng = parseFloat(path[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

// Google serves short-link redirects differently by client: browsers get the
// 302, unfamiliar agents often get a 200 interstitial with a meta-refresh or

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

// Server-only: resolve a short link by WALKING the redirect chain ourselves and
// parsing coordinates from each hop URL — never from arbitrary HTML. Google
// sunset consumer goo.gl links in 2025; whatever interstitial they serve now,
// running the @lat,lng pattern over its markup produced one deterministic junk
// coordinate for every link (the pin in Hampshire). Rules now:
//   1. URL patterns run on URLs only (every redirect hop, incl. consent
//      unwrapping) — that's where they mean something.
//   2. If the chain lands on /maps/place/<name> with no inline coordinate,
//      geocode the place name through the Geocoding API.
//   3. HTML is consulted only when the final page is a real google.*/maps
//      document, and only with page-specific patterns.
// Cached a day; always fails soft to null (callers fall back to geocoding the