"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";
import { requireAdmin } from "@/lib/admin";
import { after } from "next/server";
import { lookupZip, resolveLocation as resolveLocationData, suggestCities as suggestCitiesData } from "@/lib/us-places";

/* ------------------------------------------------------------------ *
 * Live court search.
 *
 * Flow: ZIP → geocode (cached) → Google Places text search → cheap
 * pre-filter (operational + in radius) → Claude de-noises into a
 * reliable list → cache + return. A monthly counter caps the number of
 * LIVE (paid) searches so spend can't run away; cached hits are free.
 *
 * Server-only secrets (set in Vercel):
 *   GOOGLE_MAPS_API_KEY  — Geocoding + Places (New)
 *   ANTHROPIC_API_KEY    — Claude filtering
 * Tunables (optional env, sensible defaults):
 *   COURTS_AI_MODEL                 default "claude-haiku-4-5-20251001"
 *   COURTS_MONTHLY_LIVE_SEARCH_CAP  default 800
 *   COURTS_CACHE_TTL_DAYS           default 7
 * ------------------------------------------------------------------ */

export type CourtResult = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  distanceKm: number;
  private: boolean;
  sport: string;
  website: string | null;
  /** Klimr source-checked this venue for this sport (court_sport_intel). */
  verified?: boolean;
};

export type SearchStatus = "ok" | "empty" | "not_configured" | "capped" | "bad_input" | "no_location" | "error";

export type SearchResponse = {
  status: SearchStatus;
  courts: CourtResult[];
  source: "live" | "cache" | "none";
  message?: string;
};

/** One or MORE Google text queries per sport, unioned. Racquetball venues in
 *  particular live inside recreation centers and membership gyms, so a single
 *  "racquetball court" query can drown in chain-gym noise before the real
 *  municipal courts surface; beach volleyball previously fell through to the
 *  literal key — "beach_volleyball court", underscore and all — and returned
 *  garbage. Every sport gets explicit, human phrasing. */
/** Google Table A place types that ARE the sport (decisive typeHit proof).
 *  Verified against the official Place Types (New) table — tennis_court
 *  shipped in the Feb 2026 release; no racquetball/pickleball/padel/volley
 *  types exist yet, so those sports rely on text recall + evidence. */
const TYPE_FOR: Record<string, string[]> = {
  tennis: ["tennis_court"],
};

const QUERY_FOR: Record<string, string[]> = {
  tennis: ["tennis court"],
  pickleball: ["pickleball court"],
  padel: ["padel court", "padel club"],
  racquetball: ["racquetball court", "racquetball"],
  beach_volleyball: ["beach volleyball court", "sand volleyball court"],
};

// --- Model + radius policy -------------------------------------------------
// Court screening is a simple, high-volume yes/no classification, so the cheapest
// current Claude model (Haiku 4.5) is the deliberate default.
//
// This is a PINNED snapshot ID: its behavior never changes under us, and Anthropic
// ships model *updates* as brand-new IDs — so a Haiku update will NOT break this.
// The only thing that eventually ends a pinned ID is retirement, which comes with
// >=60 days' email notice; at that point swap the string here (or just set the
// COURTS_AI_MODEL env var in Vercel — no code change needed). And if the model is
// ever unavailable for any reason, aiFilter() degrades gracefully: Courts still
// returns the Google-screened list, only without the AI de-noise pass.
/** JUDGE = Haiku: classification/routing is its documented sweet spot, and
 *  with the compact numeric verdict protocol (~80 output tokens) it rules in
 *  ~1–2s. Deep venue knowledge lives in the intel table, filled by the
 *  verifier. Retry ladder goes UP to Sonnet if Haiku ever fails. */
const COURTS_AI_MODEL_DEFAULT = "claude-haiku-4-5-20251001";
/** VERIFIER = Sonnet: it READS venue pages + reviews where quality matters
 *  and latency is free (post-response). */
const COURTS_EXTRACT_MODEL_DEFAULT = "claude-sonnet-4-6";
/** Verification freshness per verdict — venues change (closures, courts
 *  converted to other sports), so nothing is trusted forever: expired
 *  verdicts downgrade to hints and trigger automatic re-verification.
 *  Unknowns retry soonest (we learned nothing); denials get the longest
 *  window (facilities appear less often than they disappear). */
const INTEL_FRESH_DAYS: Record<string, number> = { confirmed: 60, denied: 90, unknown: 14 };
const intelIsFresh = (verdict: string, checkedAt: string): boolean =>
  Date.now() - Date.parse(checkedAt) < (INTEL_FRESH_DAYS[verdict] ?? 30) * 86_400_000;
// The user's chosen radius is LAW: we search it, filter to it, cache per it,
// and never widen it behind their back (a 32.6-mi result under a 10-mi header
// is how trust dies). Empty within the radius = say so; the radius chips are
// the user's own widening control.
const MAX_REQUEST_KM = 41; // ~25 mi — the largest radius chip

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

type RawPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  types: string[];
  primaryType: string | null;
  distanceKm: number;
  website: string | null;
};

/** Google Places (New) NEARBY search — locationRestriction is a HARD bound
 *  (unlike text search's locationBias, which is a hint Google may ignore:
 *  the source of the 32.6-mi result inside a 10-mi search). */
async function placesNearby(
  types: string[],
  lat: number,
  lng: number,
  radiusKm: number,
  key: string,
): Promise<RawPlace[]> {
  const resp = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    signal: AbortSignal.timeout(6000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.types,places.primaryType,places.websiteUri",
    },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(50000, radiusKm * 1000) } },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`[courts] Nearby HTTP ${resp.status}`, body.slice(0, 400));
    throw new Error(`nearby_http_${resp.status}`);
  }
  const data = await resp.json();
  return mapPlaces(Array.isArray(data?.places) ? data.places : [], lat, lng, radiusKm);
}

/* Google Places (New) text search, biased to the search circle. */
async function placesSearch(
  query: string,
  lat: number,
  lng: number,
  radiusKm: number,
  key: string,
  rank: "RELEVANCE" | "DISTANCE" = "RELEVANCE",
): Promise<RawPlace[]> {
  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(6000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.types,places.primaryType,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 20,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(50000, radiusKm * 1000) } },
      ...(rank === "DISTANCE" ? { rankPreference: "DISTANCE" } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`[courts] Places HTTP ${resp.status}`, body.slice(0, 400));
    throw new Error(`places_http_${resp.status}`);
  }
  const data = await resp.json();
  return mapPlaces(Array.isArray(data?.places) ? data.places : [], lat, lng, radiusKm).slice(0, 20);
}

/** One mapper for every Places call: normalize + drop closed + HARD radius
 *  filter — nothing beyond the requested radius survives, from any source. */
type GPlace = {
  id?: unknown;
  displayName?: { text?: unknown };
  location?: { latitude?: unknown; longitude?: unknown };
  formattedAddress?: unknown;
  rating?: unknown;
  userRatingCount?: unknown;
  businessStatus?: unknown;
  types?: unknown;
  primaryType?: unknown;
  websiteUri?: unknown;
};

function mapPlaces(places: unknown[], lat: number, lng: number, radiusKm: number): RawPlace[] {
  const out: RawPlace[] = [];
  for (const p of places as GPlace[]) {
    const plat = p?.location?.latitude;
    const plng = p?.location?.longitude;
    if (typeof plat !== "number" || typeof plng !== "number") continue;
    if (typeof p?.businessStatus === "string" && p.businessStatus !== "OPERATIONAL") continue; // drop closed
    const distanceKm = haversineKm(lat, lng, plat, plng);
    if (distanceKm > radiusKm) continue; // hard radius
    out.push({
      id: String(p.id),
      name: typeof p?.displayName?.text === "string" ? p.displayName.text : "Court",
      lat: plat,
      lng: plng,
      address: typeof p?.formattedAddress === "string" ? p.formattedAddress : null,
      rating: typeof p?.rating === "number" ? p.rating : null,
      ratingCount: typeof p?.userRatingCount === "number" ? p.userRatingCount : null,
      types: Array.isArray(p?.types) ? (p.types as string[]) : [],
      primaryType: typeof p?.primaryType === "string" ? p.primaryType : null,
      distanceKm,
      website: typeof p?.websiteUri === "string" ? p.websiteUri : null,
    });
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Sport keywords — the deterministic AI-down fallback gate. */
const SPORT_TOKENS: Record<string, string[]> = {
  tennis: ["tennis"],
  pickleball: ["pickleball", "pickle ball"],
  padel: ["padel"],
  racquetball: ["racquetball", "racquet ball"],
  beach_volleyball: ["beach volleyball", "sand volleyball", "volleyball"],
};

/** Post-response verifier. For up to 5 judge-flagged venues with websites:
 *  fetch the page (browser UA, 6s cap), strip to text, and have the
 *  extractor READ it — confirmed only when the page clearly shows the
 *  sport at THIS venue; denied only when a facilities list plainly omits
 *  it; unknown otherwise (a failed fetch never becomes a denial).
 *  Reliability blends verdict source and extractor confidence; verdicts
 *  persist per (venue, sport) for INTEL_FRESH_DAYS. */
/** THE VERIFIER — the system's ground truth machine, v3.
 *  One method, the strongest available: Sonnet WITH SERVER-SIDE WEB SEARCH
 *  investigates each venue like a diligent human would — the venue's own
 *  site, city/parks pages, Yelp, recent reviews — under the corroboration
 *  rules (no single source decides; recency matters; a failed hunt is
 *  "unknown", never a denial). Runs post-response (latency-free), up to 3
 *  venues per search, verdicts persist in court_sport_intel and OUTRANK
 *  every future model guess. The judge's live opinion is temporary by
 *  design; this is what makes results converge to true. */
async function verifyVenues(targets: { id: string; name: string; website: string | null }[], sport: string, anthropicKey: string): Promise<void> {
  try {
    if (targets.length === 0) return;
    const model = process.env.COURTS_EXTRACT_MODEL || COURTS_EXTRACT_MODEL_DEFAULT;
    const sportName = sportMeta(sport).name;
    const rows = await Promise.all(
      targets.map(async (v) => {
        try {
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            signal: AbortSignal.timeout(45000),
            headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model,
              max_tokens: 1000,
              temperature: 0,
              system:
                `You verify whether a specific venue CURRENTLY offers ${sportName}. Search the web: the venue's own website and facility pages, city/parks department pages, Yelp/Google reviews, recent local sources.\n` +
                `Corroboration rules: no single mention confirms or denies — require the venue's own site/an official page, OR at least two independent sources agreeing. Recent sources outweigh old ones (courts close or get converted). If sources conflict, prefer the venue's own current pages.\n` +
                `Verdicts: "confirmed" — current sources clearly show ${sportName} courts/facilities AT this venue. "denied" — the venue's own facilities information or multiple sources clearly show it does NOT offer ${sportName} (e.g. its site lists other sports only). "unknown" — you could not establish it either way; a failed search is unknown, never a denial.\n` +
                `After searching, reply with ONLY minified JSON, nothing else: {"verdict":"confirmed|denied|unknown","confidence":0..1,"evidence":"\u2264160 chars naming the source"}`,
              messages: [
                {
                  role: "user",
                  content: `Venue: ${v.name}${v.website ? ` \u2014 website: ${v.website}` : ""}. Sport: ${sportName}. Verify and reply with the JSON only.`,
                },
              ],
              tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
            }),
          });
          if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            console.error(`[courts] verifier HTTP ${resp.status} (${model})`, body.slice(0, 300));
            return null;
          }
          const data = await resp.json();
          const text = Array.isArray(data?.content)
            ? data.content
                .filter((b: { type?: string }) => b?.type === "text")
                .map((b: { text?: string }) => b.text ?? "")
                .join("")
            : "";
          const s = text.indexOf("{");
          const e = text.lastIndexOf("}");
          if (s < 0 || e <= s) {
            console.error("[courts] verifier parse failed", text.slice(0, 200));
            return null;
          }
          const parsed = JSON.parse(text.slice(s, e + 1)) as { verdict?: string; confidence?: number; evidence?: string };
          if (!["confirmed", "denied", "unknown"].includes(parsed.verdict ?? "")) return null;
          const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
          return {
            place_id: v.id,
            sport,
            verdict: parsed.verdict!,
            confidence: conf,
            reliability: parsed.verdict === "unknown" ? 0.3 : Math.min(0.95, 0.75 + 0.2 * conf),
            evidence: (parsed.evidence ?? "").slice(0, 200) || null,
            source: "web_search",
            checked_at: new Date().toISOString(),
          };
        } catch (e) {
          console.error("[courts] verifier venue failed", v.name, e instanceof Error ? e.message : e);
          return null;
        }
      }),
    );
    const clean = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    if (clean.length) {
      const admin = createAdminClient();
      await admin.from("court_sport_intel").upsert(clean, { onConflict: "place_id,sport" });
    }
  } catch (e) {
    console.error("[courts] verifyVenues failed", e instanceof Error ? e.message : e);
  }
}

/* Claude judges the candidates into a reliable, sport-specific list. */
type Intel = { verdict: string; confidence: number; evidence: string | null; stale: boolean };

async function aiFilter(
  candidates: RawPlace[],
  sport: string,
  model: string,
  key: string,
  intel: Map<string, Intel>,
): Promise<Map<string, { keep: boolean; private: boolean; name?: string }> | null> {
  const compact = candidates.map((c, i) => ({
    n: i + 1,
    name: c.name,
    primaryType: c.primaryType,
    types: c.types.slice(0, 6),
    rating: c.rating,
    ratingCount: c.ratingCount,
    address: c.address,
    distanceKm: Math.round(c.distanceKm * 10) / 10,
    intel: intel.get(c.id) ?? null,
  }));
  const system =
    `You screen Google Places candidates for ${sport} near a user. Each candidate: n (its number), name, primaryType, types, rating, ratingCount, address, distanceKm, and possibly intel = Klimr's prior source-checked verification ({verdict, confidence, evidence, stale}). FRESH intel is decisive: confirmed stays, denied goes in "drop". STALE intel is a hint — lean with it; Klimr re-checks it automatically.\n` +
    `Use real-world knowledge of venues you recognize (including which rec centers actually offer ${sport}). Unrecognized: keep if it plausibly offers ${sport}, drop if clearly not.\n` +
    `DROP: retail/equipment/brands; restaurants/hotels/offices; leagues, coaching-only, pro shops; closed/former; wrong-sport-only (paddle tennis ≠ ${sport}); venues you know lack ${sport}; duplicate listings of a venue already kept (keep the most canonical).\n` +
    `PRIVATE: members-only clubs, membership gyms/athletic clubs with ${sport}, country clubs, HOA courts — kept, just listed in "private".\n` +
    `NAMES: when a kept listing is a sub-amenity ("X Recreation Center pool"), map its n to the clean venue name. Never invent.\n` +
    `Reply ONLY minified JSON, nothing else: {"drop":[n,...],"private":[n,...],"names":{"n":"Clean Name"}}. Numbers absent from "drop" are kept.`;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages: [
          { role: "user", content: `Sport: ${sport}\nCandidates:\n${JSON.stringify(compact)}` },
          { role: "assistant", content: "{" }, // prefill: the reply IS the JSON
        ],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[courts] judge HTTP ${resp.status} (${model})`, body.slice(0, 300));
      return null;
    }
    const data = await resp.json();
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("")
      : "";
    const cleaned = ("{" + text).replace(/```json|```/g, "").trim();
    const end = cleaned.lastIndexOf("}");
    if (end < 0) {
      console.error("[courts] judge parse failed", cleaned.slice(0, 200));
      return null;
    }
    const parsed = JSON.parse(cleaned.slice(0, end + 1)) as {
      drop?: unknown[];
      private?: unknown[];
      names?: Record<string, unknown>;
    };
    const drop = new Set((parsed.drop ?? []).map(Number));
    const priv = new Set((parsed.private ?? []).map(Number));
    const map = new Map<string, { keep: boolean; private: boolean; name?: string }>();
    candidates.forEach((c, i) => {
      const num = i + 1;
      const nmRaw = parsed.names?.[String(num)];
      const nm = typeof nmRaw === "string" ? nmRaw.trim().slice(0, 80) : "";
      map.set(c.id, {
        keep: !drop.has(num),
        private: priv.has(num),
        ...(nm.length > 2 ? { name: nm } : {}),
      });
    });
    return map;
  } catch (err) {
    console.warn("[courts] AI screen errored — using Google-filtered results.", err);
    return null;
  }
}

export async function searchCourts(input: { locationKey: string; radiusKm: number; sport: string; lat?: number; lng?: number }): Promise<SearchResponse> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { status: "error", courts: [], source: "none", message: "Please sign in to search courts." };

  const sport = String(input.sport ?? "");
  const requestedKm = Math.max(1, Math.min(MAX_REQUEST_KM, Math.round(input.radiusKm)));

  if (!SPORT_KEYS.includes(sport)) {
    return { status: "bad_input", courts: [], source: "none", message: "Pick a sport." };
  }

  // Origin: precise coordinates when provided ("Use my location" sends the
  // browser's actual fix — never a ZIP-centroid snap a mile away); otherwise
  // resolve the ZIP/city key from the local US dataset. Coords cache under a
  // ~1-km bucket so nearby fixes share an envelope.
  const hasLL = Number.isFinite(input.lat) && Number.isFinite(input.lng);
  const place = hasLL
    ? { key: `ll:${input.lat!.toFixed(2)},${input.lng!.toFixed(2)}`, lat: input.lat!, lng: input.lng! }
    : resolveLocationData(String(input.locationKey ?? ""));
  if (!place) {
    return { status: "bad_input", courts: [], source: "none", message: "That location isn't recognized." };
  }
  const locationKey = place.key;

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!googleKey || !anthropicKey) {
    return { status: "not_configured", courts: [], source: "none" };
  }

  const admin = createAdminClient();
  const ttlDays = num(process.env.COURTS_CACHE_TTL_DAYS, 7);
  const cap = num(process.env.COURTS_MONTHLY_LIVE_SEARCH_CAP, 800);
  const model = process.env.COURTS_AI_MODEL || COURTS_AI_MODEL_DEFAULT;

  const noneMsg = `No verified ${sportMeta(sport).name.toLowerCase()} courts within ${Math.round(requestedKm / 1.609)} mi — try a wider radius.`;

  // 1) Fresh cache hit for THIS radius → free. (Empty results are never
  //    cached, so a bad run can't pin "no courts" for a week.)
  const { data: cacheRow } = await admin
    .from("court_search_cache")
    .select("results, fetched_at")
    .eq("zip", locationKey)
    .eq("radius_km", requestedKm)
    .eq("sport", sport)
    .maybeSingle();
  if (cacheRow) {
    const ageMs = Date.now() - new Date(cacheRow.fetched_at).getTime();
    const cached = (cacheRow.results as unknown as CourtResult[]) ?? [];
    // Non-empty results are good for the full TTL; EMPTY results are held
    // for 30 minutes — long enough to stop every retry re-burning the live
    // cap and Google quota, short enough to recover fast.
    const freshMs = cached.length > 0 ? ttlDays * 86_400_000 : 30 * 60_000;
    if (ageMs < freshMs) {
      const { data: newest } = await admin
        .from("court_sport_intel")
        .select("checked_at")
        .eq("sport", sport)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const intelNewer = newest ? Date.parse(newest.checked_at) > Date.parse(cacheRow.fetched_at) : false;
      if (!intelNewer) {
        return cached.length > 0
          ? { status: "ok", courts: cached, source: "cache" }
          : { status: "empty", courts: [], source: "cache", message: noneMsg };
      }
      // Newer intel exists → fall through to a live pass that knows it.
    }
  }

  // 2) Claim a live search slot under the monthly cap (atomic). If we're capped,
  //    serve stale cache if we have any, otherwise tell the user.
  const month = new Date().toISOString().slice(0, 7);
  const { data: claimed } = await admin.rpc("claim_live_search", { p_month: month, p_cap: cap });
  if (claimed !== true) {
    const staleCached = (cacheRow?.results as unknown as CourtResult[]) ?? [];
    if (staleCached.length > 0) {
      return { status: "ok", courts: staleCached, source: "cache", message: "Showing recent results — live search is paused until next month." };
    }
    return { status: "capped", courts: [], source: "none", message: "Live court search has hit this month's limit. Try again next month." };
  }

  // 3) Places → pre-filter → AI (location already resolved locally).
  const center = { lat: place.lat, lng: place.lng };

  let candidates: RawPlace[] = [];
  try {
    const queries = QUERY_FOR[sport] ?? [`${sportMeta(sport).name.toLowerCase()} court`];
    const typeIds = TYPE_FOR[sport] ?? [];
    // RECALL, all hard-bounded to the requested radius:
    //  - sport-typed Nearby Search where Google has the type (tennis_court);
    //  - a Nearby venue sweep (community centers, sports complexes, gyms…)
    //    so municipal courts enter the pool WITHOUT ranking for text;
    //  - the text phrasings (bias + hard post-filter) + one DISTANCE pass.
    const batches = await Promise.all([
      ...(typeIds.length ? [placesNearby(typeIds, center.lat, center.lng, requestedKm, googleKey)] : []),
      ...queries.map((q) => placesSearch(q, center.lat, center.lng, requestedKm, googleKey)),
      placesSearch(queries[0], center.lat, center.lng, requestedKm, googleKey, "DISTANCE"),
    ]);
    const seen = new Set<string>();
    candidates = batches
      .flat()
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return { status: "error", courts: [], source: "none", message: `Live search failed (${detail}) — if this persists, check the server keys in Admin → Diagnostics.` };
  }

  let wide: CourtResult[];
  let verifyTargets: { id: string; name: string; website: string | null }[] = [];
  if (candidates.length === 0) {
    wide = [];
  } else {
    const { data: intelRows } = await admin
      .from("court_sport_intel")
      .select("place_id, verdict, confidence, evidence, checked_at")
      .eq("sport", sport)
      .in("place_id", candidates.map((c) => c.id));
    const intel = new Map<string, Intel>(
      (intelRows ?? []).map((r) => [
        r.place_id,
        { verdict: r.verdict, confidence: Number(r.confidence), evidence: r.evidence, stale: !intelIsFresh(r.verdict, r.checked_at) },
      ]),
    );

    // Intel short-circuit: fresh verdicts never touch the model — decided
    // venues are instant, only the genuinely undecided get judged, and
    // searches converge toward ~1s as the intel table fills with use.
    const decidedKeep: RawPlace[] = [];
    const undecided: RawPlace[] = [];
    for (const c of candidates) {
      const iv = intel.get(c.id);
      if (iv && !iv.stale && iv.verdict === "confirmed") decidedKeep.push(c);
      else if (iv && !iv.stale && iv.verdict === "denied") continue;
      else undecided.push(c);
    }
    let verdicts = undecided.length
      ? await aiFilter(undecided, sport, model, anthropicKey, intel)
      : new Map<string, { keep: boolean; private: boolean; name?: string }>();
    if (!verdicts && model !== COURTS_EXTRACT_MODEL_DEFAULT) {
      console.error(`[courts] judge retry on ${COURTS_EXTRACT_MODEL_DEFAULT}`);
      verdicts = await aiFilter(undecided, sport, COURTS_EXTRACT_MODEL_DEFAULT, anthropicKey, intel);
    }
    if (!verdicts) {
      // Screening down ≠ no courts. Say so, and cache NOTHING — a judge
      // hiccup must never poison 30 minutes of "no courts exist".
      return { status: "error", courts: [], source: "none", message: "Court screening is briefly unavailable — try again in a moment." };
    }
    // Judge-flagged unknowns: queued for the post-response verifier
    // (cap 5 per search; intel already answered the decided ones).
    // UNIVERSAL verification: every candidate without fresh intel joins the
    // queue, nearest first, kept or dropped alike — the judge's confidence
    // is not trusted, only checked. 3 per search; a few searches per area
    // and every shown venue is ground-truth-backed.
    verifyTargets = candidates
      .filter((c) => {
        const iv = intel.get(c.id);
        return !iv || iv.stale;
      })
      .slice(0, 3)
      .map((c) => ({ id: c.id, name: c.name, website: c.website ?? null }));

    const keptJudged = undecided.filter((c) => verdicts.get(c.id)?.keep !== false);
    wide = [...decidedKeep, ...keptJudged]
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map((c) => ({
        id: c.id,
        name: verdicts.get(c.id)?.name ?? c.name,
        verified: intel.get(c.id)?.verdict === "confirmed" && !intel.get(c.id)!.stale,
        lat: c.lat,
        lng: c.lng,
        address: c.address,
        rating: c.rating,
        ratingCount: c.ratingCount,
        distanceKm: Math.round(c.distanceKm * 10) / 10,
        private: verdicts?.get(c.id)?.private === true,
        sport,
        website: c.website,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // 4) Cache the 50-mile envelope (one row per zip+sport).
  // Cache everything: non-empty rows live for the full TTL; empty rows are
  // served for only 30 minutes at read time (see above), so a bad run can't
  // pin a week of "no courts" AND retries can't burn the caps.
  await admin
    .from("court_search_cache")
    .upsert(
      { zip: locationKey, radius_km: requestedKm, sport, results: wide, fetched_at: new Date().toISOString() },
      { onConflict: "zip,radius_km,sport" },
    );

  // The thinking half of the feature, without the latency: venues the judge
  // flagged as UNSURE get verified AFTER this response is already on its way
  // — their own website is fetched and READ by the extractor, and the
  // verdict + reliability score persist in court_sport_intel. The next
  // search over this area starts from knowledge, not guesses.
  after(() => verifyVenues(verifyTargets, sport, anthropicKey));

  return wide.length > 0 ? { status: "ok", courts: wide, source: "live" } : { status: "empty", courts: [], source: "live", message: noneMsg };
}

/** Admin-only pipeline probe: runs every stage for a zip+sport and reports
 *  exactly where results die — env keys, geocode, each Places query (count +
 *  top names, or the thrown HTTP status), the AI screen's keep count, and
 *  the cache row. Rendered in Admin → Diagnostics. */
export async function probeCourtPipeline(zipRaw: string, sportRaw: string): Promise<{ report: string[] }> {
  await requireAdmin();
  const report: string[] = [];
  const sport = SPORT_KEYS.includes(sportRaw) ? sportRaw : "racquetball";
  const zip = /^\d{5}$/.test(zipRaw.trim()) ? zipRaw.trim() : "90066";
  const gKey = process.env.GOOGLE_MAPS_API_KEY;
  report.push(`GOOGLE_MAPS_API_KEY: ${gKey ? "present" : "MISSING — set it in Vercel env"}`);
  report.push(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "present" : "MISSING — set it in Vercel env"}`);
  const place = resolveLocationData(zip);
  report.push(`resolve ${zip}: ${place ? `ok (${place.lat.toFixed(3)}, ${place.lng.toFixed(3)})` : "FAILED"}`);
  const probeKm = 16; // ~10 mi — the default radius chip
  if (!place || !gKey) return { report };
  let kept = 0;
  let all: RawPlace[] = [];
  const typeIds = TYPE_FOR[sport] ?? [];
  if (typeIds.length) {
    try {
      const rows = await placesNearby(typeIds, place.lat, place.lng, probeKm, gKey);
      all = all.concat(rows);
      report.push(`nearby [${typeIds.join(",")}]: ${rows.length} candidates${rows.length ? ` — ${rows.slice(0, 5).map((r) => r.name).join(" | ")}` : ""}`);
    } catch (e) {
      report.push(`nearby [${typeIds.join(",")}]: THREW ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  for (const q of QUERY_FOR[sport] ?? [`${sportMeta(sport).name.toLowerCase()} court`]) {
    try {
      const rows = await placesSearch(q, place.lat, place.lng, probeKm, gKey);
      all = all.concat(rows);
      report.push(`places "${q}": ${rows.length} candidates${rows.length ? ` — ${rows.slice(0, 5).map((r) => r.name).join(" | ")}` : ""}`);
    } catch (e) {
      report.push(`places "${q}": THREW ${e instanceof Error ? e.message : "unknown"} (see server logs for the response body)`);
    }
  }
  if (all.length && process.env.ANTHROPIC_API_KEY) {
    const seen = new Set<string>();
    const uniq = all.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, 30);
    const adminIntel = createAdminClient();
    const { data: intelRows } = await adminIntel
      .from("court_sport_intel")
      .select("place_id, verdict, confidence, evidence, checked_at")
      .eq("sport", sport)
      .in("place_id", uniq.map((c) => c.id));
    const intel = new Map<string, Intel>(
      (intelRows ?? []).map((r) => [
        r.place_id,
        { verdict: r.verdict, confidence: Number(r.confidence), evidence: r.evidence, stale: !intelIsFresh(r.verdict, r.checked_at) },
      ]),
    );
    const iConf = [...intel.values()].filter((x) => x.verdict === "confirmed" && !x.stale).length;
    const iDeny = [...intel.values()].filter((x) => x.verdict === "denied" && !x.stale).length;
    const iStale = [...intel.values()].filter((x) => x.stale).length;
    report.push(`intel: ${iConf} confirmed, ${iDeny} denied, ${iStale} stale-for-recheck (${intel.size} of ${uniq.length} venues on file)`);
    const nameOf = (id: string) => uniq.find((c) => c.id === id)?.name ?? id.slice(0, 12);
    const verdictNames = [...intel.entries()]
      .filter(([, v]) => !v.stale && v.verdict !== "unknown")
      .slice(0, 6)
      .map(([id, v]) => `${v.verdict === "confirmed" ? "\u2713" : "\u2717"} ${nameOf(id)}`);
    if (verdictNames.length) report.push(`intel verdicts: ${verdictNames.join(" | ")}`);
    const tJudge = Date.now();
    let verdicts = await aiFilter(uniq, sport, process.env.COURTS_AI_MODEL || COURTS_AI_MODEL_DEFAULT, process.env.ANTHROPIC_API_KEY, intel);
    const judgeMs = Date.now() - tJudge;
    let retryNote = "";
    if (!verdicts) {
      const tRetry = Date.now();
      verdicts = await aiFilter(uniq, sport, COURTS_EXTRACT_MODEL_DEFAULT, process.env.ANTHROPIC_API_KEY, intel);
      retryNote = ` · retry ${COURTS_EXTRACT_MODEL_DEFAULT}: ${verdicts ? "ok" : "unavailable"} in ${Date.now() - tRetry}ms`;
    }
    const tokens = SPORT_TOKENS[sport] ?? [sportMeta(sport).name.toLowerCase()];
    const sportTypes = TYPE_FOR[sport] ?? [];
    const keptRows = verdicts
      ? uniq.filter((c) => verdicts.get(c.id)?.keep !== false)
      : uniq.filter((c) => tokens.some((k) => c.name.toLowerCase().includes(k)) || sportTypes.some((tp) => c.types.includes(tp)));
    kept = keptRows.length;
    report.push(`AI judge (${process.env.COURTS_AI_MODEL || COURTS_AI_MODEL_DEFAULT}): ${verdicts && !retryNote ? `${kept} of ${uniq.length} kept` : `${verdicts ? `${kept} of ${uniq.length} kept via retry` : "unavailable"}`} in ${judgeMs}ms${retryNote} (≈20000ms = timeout; fast failure = HTTP/model error — see server logs)`);
    if (keptRows.length) report.push(`kept: ${keptRows.slice(0, 6).map((c) => verdicts?.get(c.id)?.name ?? c.name).join(" | ")}`);
  }
  const adminDb = createAdminClient();
  const { data: cacheRow } = await adminDb
    .from("court_search_cache")
    .select("results, fetched_at")
    .eq("zip", zip)
    .eq("radius_km", probeKm)
    .eq("sport", sport)
    .maybeSingle();
  report.push(
    cacheRow
      ? `cache (${zip}/${sport}): ${((cacheRow.results as unknown as unknown[]) ?? []).length} rows, fetched ${cacheRow.fetched_at}`
      : `cache (${zip}/${sport}): none`,
  );
  return { report };
}

/* ------------------------------------------------------------------ *
 * Location input (ZIP or city) — all free + local, no Google.
 * ------------------------------------------------------------------ */

export type CitySuggestion = { key: string; label: string };

/* Autocomplete US cities by (partial) name. Letters only — digits are ZIPs. */
export async function suggestCities(query: string): Promise<CitySuggestion[]> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];
  const q = String(query ?? "");
  if (!/[a-zA-Z]/.test(q)) return [];
  return suggestCitiesData(q, 7).map((c) => ({ key: c.key, label: c.label }));
}

/* Validate a 5-digit US ZIP exists before we ever spend on a search. */
export async function checkZip(zip: string): Promise<{ valid: boolean; label?: string }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { valid: false };
  const z = lookupZip(String(zip ?? ""));
  return z ? { valid: true, label: `${z.city}, ${z.state}` } : { valid: false };
}

/* ------------------------------------------------------------------ *
 * Court picker (match creation).
 * ------------------------------------------------------------------ */

export type PickerCourt = {
  key: string; // stable react key: courtId ?? placeId
  courtId: string | null; // directory row, if persisted
  placeId: string | null; // google place id, if from Google
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  ratingCount: number | null;
  private: boolean;
  sport: string;
  distanceKm: number | null;
  website: string | null;
};

export type PickerResponse = {
  status: SearchStatus;
  courts: PickerCourt[];
  source: "directory" | "mixed" | "none";
  message?: string;
};

export type GoogleCourtInput = {
  placeId: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  private?: boolean;
  sport: string;
  website?: string | null;
};

/* FREE court list for the match picker: the directory (seeds + courts anyone has
 * used) plus any cached search envelope already on file for this ZIP. This NEVER
 * triggers a paid Places/AI search — only the explicit "Search nearby" path does. */
export async function courtsNearZip(input: { zip: string; sport: string }): Promise<PickerResponse> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { status: "error", courts: [], source: "none", message: "Please sign in." };

  const zip = String(input.zip ?? "").trim();
  const sport = String(input.sport ?? "");
  if (!/^\d{5}$/.test(zip) || !SPORT_KEYS.includes(sport)) {
    return { status: "bad_input", courts: [], source: "none" };
  }

  const admin = createAdminClient();

  // Geocode the ZIP locally (free, offline) — only to sort/limit by distance.
  const zc = lookupZip(zip);
  const center: { lat: number; lng: number } | null = zc ? { lat: zc.lat, lng: zc.lng } : null;

  const within = MAX_REQUEST_KM; // ~25 mi picker window
  const byKey = new Map<string, PickerCourt>();
  const placeIds = new Set<string>();

  // 1) Directory courts for this sport.
  const { data: dirRows } = await admin
    .from("courts")
    .select("id, name, sports, address, neighborhood, city, lat, lng, rating, rating_count, is_private, google_place_id, website")
    .contains("sports", [sport]);
  for (const c of dirRows ?? []) {
    const dist =
      center && typeof c.lat === "number" && typeof c.lng === "number"
        ? Math.round(haversineKm(center.lat, center.lng, c.lat, c.lng) * 10) / 10
        : null;
    if (center && dist != null && dist > within) continue;
    const place = [c.neighborhood, c.city].filter(Boolean).join(", ");
    byKey.set(c.id, {
      key: c.id,
      courtId: c.id,
      placeId: c.google_place_id ?? null,
      name: c.name,
      address: c.address ?? (place || null),
      lat: c.lat,
      lng: c.lng,
      rating: c.rating,
      ratingCount: c.rating_count,
      private: c.is_private === true,
      sport,
      distanceKm: dist,
      website: c.website ?? null,
    });
    if (c.google_place_id) placeIds.add(c.google_place_id);
  }

  // 2) Merge every cached radius row for this ZIP+sport (free, already screened).
  const { data: cacheRows } = await admin
    .from("court_search_cache")
    .select("results")
    .eq("zip", zip)
    .eq("sport", sport);
  for (const cacheRow of cacheRows ?? []) {
    const cached = (cacheRow.results as unknown as CourtResult[]) ?? [];
    for (const c of cached) {
      if (placeIds.has(c.id) || byKey.has(c.id)) continue;
      byKey.set(c.id, {
        key: c.id,
        courtId: null,
        placeId: c.id,
        name: c.name,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        rating: c.rating,
        ratingCount: c.ratingCount,
        private: c.private,
        sport,
        distanceKm: c.distanceKm ?? null,
        website: c.website ?? null,
      });
    }
  }

  const courts = [...byKey.values()].sort((a, b) => {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return { status: courts.length ? "ok" : "empty", courts, source: (cacheRows ?? []).length > 0 ? "mixed" : "directory" };
}

/* Persist a Google-discovered court into the directory (dedupe by place id),
 * preserving any sports already listed. Server-only write via service role. */
export async function upsertGoogleCourt(input: GoogleCourtInput): Promise<{ courtId: string | null; error?: string }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { courtId: null, error: "Please sign in." };

  const placeId = String(input.placeId ?? "").trim();
  const name = String(input.name ?? "").trim();
  const sport = String(input.sport ?? "");
  if (!placeId || !name) return { courtId: null, error: "Missing court details." };

  const admin = createAdminClient();
  const fields = {
    name,
    address: input.address ?? null,
    lat: typeof input.lat === "number" ? input.lat : null,
    lng: typeof input.lng === "number" ? input.lng : null,
    rating: typeof input.rating === "number" ? input.rating : null,
    rating_count: typeof input.ratingCount === "number" ? input.ratingCount : null,
    is_private: input.private === true,
    website: input.website ?? null,
  };

  const { data: existing, error: selErr } = await admin
    .from("courts")
    .select("id, sports")
    .eq("google_place_id", placeId)
    .maybeSingle();
  if (selErr) console.error("[courts] court lookup failed", selErr.code, selErr.message);

  if (existing) {
    const has = SPORT_KEYS.includes(sport) && Array.isArray(existing.sports) && existing.sports.includes(sport);
    const nextSports = has || !SPORT_KEYS.includes(sport) ? existing.sports : [...(existing.sports ?? []), sport];
    await admin.from("courts").update({ ...fields, sports: nextSports }).eq("id", existing.id);
    return { courtId: existing.id };
  }

  const { data: inserted, error } = await admin
    .from("courts")
    .insert({ ...fields, google_place_id: placeId, sports: SPORT_KEYS.includes(sport) ? [sport] : [] })
    .select("id")
    .single();
  if (error || !inserted) {
    // Lost an insert race? Re-read by place id.
    const { data: again } = await admin.from("courts").select("id").eq("google_place_id", placeId).maybeSingle();
    if (again) return { courtId: again.id };
    console.error("[courts] court insert failed", error?.code, error?.message, error?.details, error?.hint);
    return { courtId: null, error: `Couldn't save the court${error?.code ? ` (${error.code})` : ""}.` };
  }
  return { courtId: inserted.id };
}

/** Reverse-geocode the browser's coordinates into a ZIP for the finder's
 *  "Use my location" — graceful null when the key is absent or Google finds
 *  no postal code. */
export async function reverseToZip(input: { lat: number; lng: number }): Promise<{ zip: string | null }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return { zip: null };
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${input.lat},${input.lng}&result_type=postal_code&key=${key}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { zip: null };
    const data = (await res.json()) as { results?: { address_components?: { types: string[]; short_name: string }[] }[] };
    for (const r of data.results ?? []) {
      const pc = (r.address_components ?? []).find((c) => c.types.includes("postal_code"));
      if (pc?.short_name && /^\d{5}$/.test(pc.short_name)) return { zip: pc.short_name };
    }
  } catch {
    /* fall through */
  }
  return { zip: null };
}

/** Coverage gap-fill (0151): scan Google Places for a zip+sport and ingest
 *  anything the courts table is missing. CourtResult.id IS the Google place
 *  id (the search maps Places results directly). A scan is logged — and its
 *  30-day cache honored — only for REAL answers ("ok"/"empty"); capped,
 *  unconfigured, and error outcomes retry on the next search instead of
 *  poisoning the cache. */
export async function scanZipForCourts(zip: string, sports: string[], radiusMi: number): Promise<number> {
  if (!/^\d{5}$/.test(zip)) return 0;
  const list = [...new Set(sports.filter((s) => SPORT_KEYS.includes(s)))].slice(0, 16);
  if (!list.length) return 0;
  const admin = createAdminClient();
  const { data: logs } = await admin.from("courts_scan_log").select("sport, scanned_at").eq("zip", zip).in("sport", list);
  const fresh = new Set(
    (logs ?? []).filter((l) => Date.parse(l.scanned_at) > Date.now() - 30 * 86_400_000).map((l) => l.sport),
  );
  let added = 0;
  for (const sport of list) {
    if (fresh.has(sport)) continue;
    try {
      const res = await searchCourts({ locationKey: zip, radiusKm: Math.max(5, Math.min(40, Math.round(radiusMi * 1.609))), sport });
      console.error("[courts scan]", zip, sport, res.status, `candidates:${res.courts.length}`);
      if (res.status === "ok") {
        for (const c of res.courts) {
          // Belt: never re-ingest a table-sourced row (uuid-shaped id).
          if (!c.id || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id)) continue;
          const r = await upsertGoogleCourt({
            placeId: c.id,
            name: c.name,
            sport,
            address: c.address ?? null,
            lat: c.lat,
            lng: c.lng,
            rating: c.rating ?? undefined,
            ratingCount: c.ratingCount ?? undefined,
            private: c.private === true,
            website: c.website ?? undefined,
          });
          if (r.courtId) added++;
        }
      }
      if (res.status === "ok" || res.status === "empty") {
        await admin.from("courts_scan_log").upsert({ zip, sport, scanned_at: new Date().toISOString() });
      }
    } catch (err) {
      console.error("[courts scan] failed", zip, sport, err instanceof Error ? err.message : err);
    }
  }
  return added;
}
