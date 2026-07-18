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
// venue text).
export async function resolveMapsShortLink(raw: string | null | undefined): Promise<LatLng | null> {
  if (!raw || !isMapsShortLink(raw)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    let current = raw;
    let finalRes: Response | null = null;
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; KlimrBot/1.0; +https://klimr.com)" },
        cache: "no-store",
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).toString();
        const unwrapped = unwrapGoogleRedirect(current) ?? embeddedUrlParam(current);
        if (unwrapped) current = unwrapped;
        const p = parseLatLngFromMapsUrl(current);
        if (p) return p;
        continue;
      }
      finalRes = res;
      break;
    }
    const fromFinalUrl = parseLatLngFromMapsUrl(current);
    if (fromFinalUrl) return fromFinalUrl;
    const place = placeTextFromMapsUrl(current);
    if (place) {
      const g = await geocodeAddress(place);
      if (g) return g;
    }
    // HTML is consulted ONLY for a concrete /maps/place page. An expired short
    // link redirects to the bare Maps homepage, whose embedded viewport is the
    // SERVER's IP geolocation — scraping that is how every event pin ended up
    // on a lane in Hampshire. A homepage landing is a failure, full stop.
    if (finalRes && isGoogleMapsPlacePage(current)) {
      const body = (await finalRes.text()).slice(0, 400_000);
      const fromBody = parseLatLngFromHtml(body);
      if (fromBody) return fromBody;
    }
    // Last resort: let the platform follow the whole chain and read ONLY the
    // final URL (never a body) — catches redirect shapes the manual walk missed.
    try {
      const followed = await fetch(raw, { redirect: "follow", signal: controller.signal, cache: "no-store", headers: { "user-agent": "Mozilla/5.0 (compatible; KlimrBot/1.0; +https://klimr.com)" } });
      const p2 = parseLatLngFromMapsUrl(followed.url);
      if (p2) return p2;
      const place2 = placeTextFromMapsUrl(followed.url);
      if (place2) {
        const g2 = await geocodeAddress(place2);
        if (g2) return g2;
      }
      console.error("[maps] short-link unresolved", { raw, walked: current, followed: followed.url, status: followed.status });
    } catch {
      console.error("[maps] short-link unresolved", { raw, walked: current });
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isGoogleMapsPlacePage(u: string): boolean {
  try {
    const url = new URL(u);
    return /(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname.startsWith("/maps/place/");
  } catch {
    return false;
  }
}

// Google loves nesting the real destination in a query param (?continue=,
// ?link=, ?url=, ?q=<full url>) — unwrap generically when the value is a URL.
function embeddedUrlParam(u: string): string | null {
  try {
    const url = new URL(u);
    for (const k of ["continue", "link", "url", "q"]) {
      const v = url.searchParams.get(k);
      if (v && /^https?:\/\//i.test(v)) return v;
    }
    return null;
  } catch {
    return null;
  }
}

// consent.google.com wraps the real destination in ?continue=…
function unwrapGoogleRedirect(u: string): string | null {
  try {
    const url = new URL(u);
    if (!/(^|\.)consent\.google\./.test(url.hostname) && !/\/sorry\//.test(url.pathname)) return null;
    const cont = url.searchParams.get("continue");
    return cont ? decodeURIComponent(cont) : null;
  } catch {
    return null;
  }
}

// "/maps/place/Lot+8+North+Beach/…" → "Lot 8 North Beach"; also non-numeric ?q=.
export function placeTextFromMapsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (m) {
      const name = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
      if (name && !/^-?\d+\.\d+,/.test(name)) return name;
    }
    const q = url.searchParams.get("q") || url.searchParams.get("query");
    if (q && !/^-?\d+\.\d+\s*,/.test(q)) return q.trim();
    return null;
  } catch {
    return null;
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

// Google's map pages embed the viewport in APP_INITIALIZATION_STATE as
// [[[zoom, LNG, LAT], …]] and sometimes expose "latitude"/"longitude" JSON.
// Last-resort extraction when the redirect URL itself carried no coordinate.
function parseLatLngFromHtml(body: string): LatLng | null {
  // Deliberately NO viewport/APP_INITIALIZATION_STATE pattern here: a map
  // page's viewport is wherever Google geolocated the requesting IP. Only the
  // place's own latitude/longitude JSON is trustworthy.
  const kv = body.match(/"latitude"\s*:\s*(-?\d+\.\d+)[\s\S]{0,120}?"longitude"\s*:\s*(-?\d+\.\d+)/);
  if (kv) {
    const lat = parseFloat(kv[1]);
    const lng = parseFloat(kv[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng };
  }
  return null;
}


// Find the first Google Maps link inside free text (event descriptions often
// carry the organizer's real pin — "Ponto de encontro: https://goo.gl/maps/…" —
// while the structured location field only says the city). Trailing punctuation
// that prose likes to glue onto URLs is stripped.
const MAPS_URL_RE =
  /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps[^\s<>"')\]]*|maps\.google\.[a-z.]+[^\s<>"')\]]*|maps\.app\.goo\.gl\/[^\s<>"')\]]+|goo\.gl\/maps\/[^\s<>"')\]]+|g\.co\/[^\s<>"')\]]+)/i;

export function firstMapsUrlInText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(MAPS_URL_RE);
  if (!m) return null;
  return m[0].replace(/[.,;:!?]+$/, "");
}

// Server-only: geocode free address text through the Geocoding API (same
// GOOGLE_MAPS_API_KEY as court search). The keyless embed's own text geocoding
// is unreliable — "Santa Monica, CA" has landed on a lane in Hampshire — so when
// we have no link-derived pin we resolve the text ourselves and hand the embed
// exact coordinates. Cached a month per address; always fails soft to null.
export async function geocodeAddress(address: string | null | undefined): Promise<LatLng | null> {
  const q = (address ?? "").trim();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!q || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`,
      { signal: controller.signal, next: { revalidate: 2_592_000 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { geometry?: { location?: { lat: number; lng: number } } }[] };
    const loc = data.results?.[0]?.geometry?.location;
    if (loc && validLatLng(loc.lat, loc.lng)) return { lat: loc.lat, lng: loc.lng };
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
