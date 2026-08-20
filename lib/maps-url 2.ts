import { safeGet, type SafeResponse } from "@/lib/egress";
import { isPermittedMapsHop } from "@/lib/maps-hop-rules";
import { parseLatLngFromMapsUrl, isMapsShortLink, validLatLng, type LatLng } from "@/lib/maps-parse";

/** Server-side Maps resolution. The PURE parsers live in `lib/maps-parse.ts` —
 *  this module reaches the network, so importing it from a client component
 *  drags `node:dns` into the browser bundle and fails the build. Re-exported
 *  below so existing server callers keep working unchanged. */
export { parseLatLngFromMapsUrl, isMapsShortLink };
export type { LatLng };

// JS hop. A browser-grade UA gets the honest redirect chain.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";


// venue text).
const short = (u: string) => (u.length > 96 ? u.slice(0, 93) + "…" : u);

export async function resolveMapsShortLink(raw: string | null | undefined, trace?: string[]): Promise<LatLng | null> {
  if (!raw || !isMapsShortLink(raw)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    let current = raw;
    let finalRes: SafeResponse | null = null;
    for (let hop = 0; hop < 6; hop++) {
      // KCDX-019: revalidate on EVERY hop. `current` at this point may have come
      // from a Location header, a consent unwrap, or a URL scraped out of HTML —
      // all attacker-influenced. Checking only the URL we were handed is the
      // whole bug.
      if (!isPermittedMapsHop(current)) {
        trace?.push(`refused hop ${hop + 1}: ${short(current)} is not a permitted Maps host`);
        return null;
      }
      // safeGet refuses to connect to a non-public address, checked inside the
      // DNS lookup the socket itself uses — so an allowlisted host that resolves
      // to link-local or RFC1918 space (DNS rebinding) is stopped at connect,
      // not merely at the allowlist above. It never follows redirects: the walk
      // stays here, where each hop is re-checked.
      const res = await safeGet(current, {
        headers: { "user-agent": BROWSER_UA, "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" },
        timeoutMs: 6500,
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
    // REMOVED (KCDX-019, second pass). This used to be a "last resort" that
    // called `fetch(raw, { redirect: "follow" })` and read the final URL — the
    // reasoning being that the platform catches redirect shapes the manual walk
    // misses. It also catches every shape the allowlist exists to refuse: with
    // `redirect: follow` the runtime walks the whole chain itself, so a hop to
    // link-local or RFC1918 space is followed before any of our code sees it.
    //
    // The first SSRF pass fixed `resolveMapsShortLink`'s loop and left this
    // sitting twenty lines below it, which is worth recording plainly: "the
    // check runs before every fetch" was true of the function I was reading and
    // false of the file. Enumerate the call sites, not the ones in view.
    //
    // Nothing replaces it. The manual walk already unwraps consent and HTML
    // continuations across six hops, and an unresolved short link falls through
    // to geocoding the venue text — a slightly worse pin, not a broken feature.
    console.error("[maps] short-link unresolved", { raw, walked: current });
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
