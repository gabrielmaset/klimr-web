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
// JS hop. A browser-grade UA gets the honest redirect chain.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
const short = (u: string) => (u.length > 96 ? u.slice(0, 93) + "…" : u);

export async function resolveMapsShortLink(raw: string | null | undefined, trace?: string[]): Promise<LatLng | null> {
  if (!raw || !isMapsShortLink(raw)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    let current = raw;
    let finalRes: Response | null = null;
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": BROWSER_UA, "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" },
        cache: "no-store",
      });
      const loc = res.headers.get("location");
      trace?.push(`walk ${hop + 1}: ${short(current)} → ${res.status}${loc ? " → " + short(loc) : ""}`);
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).toString();
        const unwrapped = unwrapGoogleRedirect(current) ?? embeddedUrlParam(current);
        if (unwrapped) current = unwrapped;
        const p = parseLatLngFromMapsUrl(current);
        if (p) return p;
        continue;
      }
      // Short-link hosts sometimes 200 with an HTML hop instead of a 3xx.
      if (res.status === 200 && isMapsShortLink(current)) {
        const body = (await res.text()).slice(0, 300_000);
        const next = extractContinuationUrl(body, current);
        trace?.push(next ? `html continuation → ${short(next)}` : "200 body had no continuation URL");
        if (next) {
          current = next;
          const p = parseLatLngFromMapsUrl(current);
          if (p) return p;
          continue;
        }
      }
      finalRes = res;
      break;
    }
    const fromFinalUrl = parseLatLngFromMapsUrl(current);
    if (fromFinalUrl) {
      trace?.push(`coords in final URL: ${fromFinalUrl.lat.toFixed(4)}, ${fromFinalUrl.lng.toFixed(4)}`);
      return fromFinalUrl;
    }
    const place = placeTextFromMapsUrl(current);
    if (place) {
      const g = await geocodeAddress(place);
      trace?.push(`place text "${place}" → ${g ? `${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}` : "geocode miss"}`);
      if (g) return g;
    }
    // HTML is consulted ONLY for a concrete /maps/place page. An expired short
    // link redirects to the bare Maps homepage, whose embedded viewport is the
    // SERVER's IP geolocation — scraping that is how every event pin ended up
    // on a lane in Hampshire. A homepage landing is a failure, full stop.
    if (finalRes && isGoogleMapsPlacePage(current)) {
      const body = (await finalRes.text()).slice(0, 400_000);
      const fromBody = parseLatLngFromHtml(body);
      trace?.push(fromBody ? `place-page body coords: ${fromBody.lat.toFixed(4)}, ${fromBody.lng.toFixed(4)}` : "place page had no parseable coords");
      if (fromBody) return fromBody;
    } else if (finalRes) {
      trace?.push(`walk ended at ${short(current)} — not a place page, body refused (Hampshire rule)`);
    }
    // Last resort: let the platform follow the whole chain and read ONLY the
    // final URL (never a body) — catches redirect shapes the manual walk missed.
    try {
      const followed = await fetch(raw, { redirect: "follow", signal: controller.signal, cache: "no-store", headers: { "user-agent": BROWSER_UA, "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" } });
      trace?.push(`platform-follow final: ${short(followed.url)} (${followed.status})`);
      const p2 = parseLatLngFromMapsUrl(followed.url);
      if (p2) return p2;
      const place2 = placeTextFromMapsUrl(followed.url);
      if (place2) {
        const g2 = await geocodeAddress(place2);
        trace?.push(`follow place text "${place2}" → ${g2 ? "geocoded" : "miss"}`);
        if (g2) return g2;
      }
      console.error("[maps] short-link unresolved", { raw, walked: current, followed: followed.url, status: followed.status });
    } catch {
      console.error("[maps] short-link unresolved", { raw, walked: current });
    }
    return null;
  } catch (err) {
    trace?.push(`aborted: ${err instanceof Error ? err.name : "error"} (likely timeout)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// When a SHORT-LINK host answers 200 instead of 3xx, the real destination is
// usually inside the HTML: a meta-refresh, a JS location hop, or a canonical
// maps.google link. Extract that URL and keep walking — this pulls a URL to
// continue the redirect chain, never a coordinate from page markup.
function extractContinuationUrl(body: string, baseUrl: string): string | null {
  const meta = body.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i)
    ?? body.match(/content=["']\d+;\s*url=([^"']+)["']/i);
  const js = body.match(/location(?:\.href)?\s*(?:=|\.replace\()\s*["']([^"']+)["']/i);
  const canonical = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const mapsHref = body.match(/href=["'](https:\/\/(?:www\.)?google\.[a-z.]+\/maps[^"']*)["']/i);
  for (const cand of [meta?.[1], js?.[1], canonical?.[1], mapsHref?.[1]]) {
    if (!cand) continue;
    try {
      const abs = new URL(cand.replace(/&amp;/g, "&"), baseUrl).toString();
      if (/^https?:\/\//i.test(abs) && abs !== baseUrl) return abs;
    } catch {
      /* try next */
    }
  }
  return null;
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
export async function mapsPointFromUrl(raw: string | null | undefined, trace?: string[]): Promise<LatLng | null> {
  const direct = parseLatLngFromMapsUrl(raw);
  if (direct) return direct;
  if (isMapsShortLink(raw)) return resolveMapsShortLink(raw, trace);
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

// ── The definitive pin ladder (0146) ─────────────────────────────────────────
// Google retired consumer goo.gl links in 2025, so a dead short link must never
// be the end of the road. Organizers almost always write the real street
// address in the description ("772-798 Pacific Coast Hwy, Santa Monica, CA
// 90403") — a source that can't rot. Resolution runs ONCE at save (and as a
// lazy heal for older events), and the result persists on the events row.


export type ResolvedPin = { point: LatLng; source: "link" | "address" | "venue" };

/** Server-only. The pin ladder — the organizer's LINK is the source of truth:
 *  link coords → resolved short link → a Maps LINK inside the description →
 *  geocoded venue text. Prose addresses are deliberately NOT read (an address
 *  in the description may describe a different place). Fails soft to null. */
export async function resolveEventPin(
  input: {
    locationUrl: string | null | undefined;
    description: string | null | undefined;
    venueText: string | null | undefined;
  },
  trace?: string[],
): Promise<ResolvedPin | null> {
  if (input.locationUrl) trace?.push(`rung 1 — the pasted link: ${short(input.locationUrl)}`);
  const fromLink = await mapsPointFromUrl(input.locationUrl, trace);
  if (fromLink) return { point: fromLink, source: "link" };
  const descUrl = firstMapsUrlInText((input.description ?? "").replace(/<[^>]+>/g, " "));
  if (descUrl && descUrl !== input.locationUrl) {
    trace?.push(`rung 2 — Maps link in description: ${short(descUrl)}`);
    const fromDescLink = await mapsPointFromUrl(descUrl, trace);
    if (fromDescLink) return { point: fromDescLink, source: "link" };
  }
  const venue = (input.venueText ?? "").trim();
  if (venue) {
    const g = await geocodeAddress(venue);
    trace?.push(`rung 3 — venue text "${venue}" → ${g ? `${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}` : "geocode miss"}`);
    if (g) return { point: g, source: "venue" };
  }
  return null;
}
