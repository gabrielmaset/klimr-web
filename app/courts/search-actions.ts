"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
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
};

export type SearchStatus = "ok" | "empty" | "not_configured" | "capped" | "bad_input" | "no_location" | "error";

export type SearchResponse = {
  status: SearchStatus;
  courts: CourtResult[];
  source: "live" | "cache" | "none";
  message?: string;
  /** True when the requested radius found nothing and we widened to 50 mi. */
  expanded?: boolean;
};

const QUERY_FOR: Record<string, string> = {
  tennis: "tennis court",
  pickleball: "pickleball court",
  padel: "padel court",
  racquetball: "racquetball court",
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
const COURTS_AI_MODEL_DEFAULT = "claude-haiku-4-5-20251001";
// Users can pick up to 25 mi. If a search finds nothing, we auto-widen to a 50-mi
// envelope before reporting "none found" (Google biases up to 50 km; the distance
// filter spans the full 50 mi). We fetch + cache that envelope once per zip+sport.
const MAX_REQUEST_KM = 41; // ~25 mi
const WIDE_KM = 80; // ~50 mi

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
};

/* Google Places (New) text search, biased to the search circle. */
async function placesSearch(
  query: string,
  lat: number,
  lng: number,
  radiusKm: number,
  key: string,
): Promise<RawPlace[]> {
  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.types,places.primaryType",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 20,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(50000, radiusKm * 1000) } },
    }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const places = Array.isArray(data?.places) ? data.places : [];
  const out: RawPlace[] = [];
  for (const p of places) {
    const plat = p?.location?.latitude;
    const plng = p?.location?.longitude;
    if (typeof plat !== "number" || typeof plng !== "number") continue;
    if (p?.businessStatus && p.businessStatus !== "OPERATIONAL") continue; // drop closed
    const distanceKm = haversineKm(lat, lng, plat, plng);
    if (distanceKm > radiusKm) continue; // hard radius
    out.push({
      id: String(p.id),
      name: p?.displayName?.text ?? "Court",
      lat: plat,
      lng: plng,
      address: p?.formattedAddress ?? null,
      rating: typeof p?.rating === "number" ? p.rating : null,
      ratingCount: typeof p?.userRatingCount === "number" ? p.userRatingCount : null,
      types: Array.isArray(p?.types) ? p.types : [],
      primaryType: p?.primaryType ?? null,
      distanceKm,
    });
  }
  // De-dupe + keep the closest first; cap candidates for the AI pass.
  const seen = new Set<string>();
  return out
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);
}

/* Claude de-noises the candidates into a reliable, sport-specific list. */
async function aiFilter(
  candidates: RawPlace[],
  sport: string,
  model: string,
  key: string,
): Promise<Map<string, { keep: boolean; private: boolean }> | null> {
  const compact = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    primaryType: c.primaryType,
    types: c.types.slice(0, 6),
    rating: c.rating,
    ratingCount: c.ratingCount,
    address: c.address,
  }));
  const system =
    `You verify whether map search results are genuine, currently-operating, publicly-bookable ${sport} courts. ` +
    `Drop false positives: sporting-goods stores, unrelated gyms with no ${sport} courts, equipment brands, ` +
    `permanently closed venues, and results that are clearly not ${sport} facilities. Keep real ${sport} courts ` +
    `(public parks, rec centers, dedicated clubs). Mark members-only or private clubs with "private": true but still keep them. ` +
    `Reply with ONLY a JSON object, no prose: {"results":[{"id":"<id>","keep":true,"private":false}]}. Include every input id exactly once.`;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: `Sport: ${sport}\nCandidates:\n${JSON.stringify(compact)}` }],
      }),
    });
    if (!resp.ok) {
      console.warn(`[courts] AI screen unavailable (HTTP ${resp.status}) — using Google-filtered results.`);
      return null;
    }
    const data = await resp.json();
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("")
      : "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const map = new Map<string, { keep: boolean; private: boolean }>();
    for (const r of parsed?.results ?? []) {
      if (r && typeof r.id === "string") map.set(r.id, { keep: r.keep !== false, private: r.private === true });
    }
    return map;
  } catch (err) {
    console.warn("[courts] AI screen errored — using Google-filtered results.", err);
    return null;
  }
}

export async function searchCourts(input: { locationKey: string; radiusKm: number; sport: string }): Promise<SearchResponse> {
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

  // Resolve the location (a ZIP or a "city|state" key) to a centroid from the
  // local US dataset — free, offline, and it validates existence in one step.
  const place = resolveLocationData(String(input.locationKey ?? ""));
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

  // Given the cached/fetched 50-mi envelope, return the requested radius if it has
  // anything; otherwise widen to the full envelope (flagged); otherwise report none.
  const shape = (wide: CourtResult[], source: "live" | "cache"): SearchResponse => {
    const near = wide.filter((c) => c.distanceKm <= requestedKm + 0.05);
    if (near.length > 0) return { status: "ok", courts: near, source };
    if (wide.length > 0) return { status: "ok", courts: wide, source, expanded: true };
    return { status: "empty", courts: [], source, message: "No courts found within 50 miles." };
  };

  // 1) Fresh cache hit (the 50-mile envelope) → free.
  const { data: cacheRow } = await admin
    .from("court_search_cache")
    .select("results, fetched_at")
    .eq("zip", locationKey)
    .eq("radius_km", WIDE_KM)
    .eq("sport", sport)
    .maybeSingle();
  if (cacheRow) {
    const ageMs = Date.now() - new Date(cacheRow.fetched_at).getTime();
    if (ageMs < ttlDays * 86_400_000) {
      return shape((cacheRow.results as unknown as CourtResult[]) ?? [], "cache");
    }
  }

  // 2) Claim a live search slot under the monthly cap (atomic). If we're capped,
  //    serve stale cache if we have any, otherwise tell the user.
  const month = new Date().toISOString().slice(0, 7);
  const { data: claimed } = await admin.rpc("claim_live_search", { p_month: month, p_cap: cap });
  if (claimed !== true) {
    if (cacheRow) {
      const r = shape((cacheRow.results as unknown as CourtResult[]) ?? [], "cache");
      return { ...r, message: r.message ?? "Showing recent results — live search is paused until next month." };
    }
    return { status: "capped", courts: [], source: "none", message: "Live court search has hit this month's limit. Try again next month." };
  }

  // 3) Places → pre-filter → AI (location already resolved locally).
  const center = { lat: place.lat, lng: place.lng };

  let candidates: RawPlace[] = [];
  try {
    candidates = await placesSearch(QUERY_FOR[sport] ?? `${sport} court`, center.lat, center.lng, WIDE_KM, googleKey);
  } catch {
    return { status: "error", courts: [], source: "none", message: "Search is temporarily unavailable." };
  }

  let wide: CourtResult[];
  if (candidates.length === 0) {
    wide = [];
  } else {
    const verdicts = await aiFilter(candidates, sport, model, anthropicKey);
    wide = candidates
      .filter((c) => (verdicts ? verdicts.get(c.id)?.keep !== false : true)) // AI down → keep pre-filtered list
      .map((c) => ({
        id: c.id,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        address: c.address,
        rating: c.rating,
        ratingCount: c.ratingCount,
        distanceKm: Math.round(c.distanceKm * 10) / 10,
        private: verdicts?.get(c.id)?.private === true,
        sport,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // 4) Cache the 50-mile envelope (one row per zip+sport).
  await admin
    .from("court_search_cache")
    .upsert(
      { zip: locationKey, radius_km: WIDE_KM, sport, results: wide, fetched_at: new Date().toISOString() },
      { onConflict: "zip,radius_km,sport" },
    );

  return shape(wide, "live");
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
    .select("id, name, sports, address, neighborhood, city, lat, lng, rating, rating_count, is_private, google_place_id")
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
    });
    if (c.google_place_id) placeIds.add(c.google_place_id);
  }

  // 2) Merge any cached search envelope for this ZIP+sport (free, already screened).
  const { data: cacheRow } = await admin
    .from("court_search_cache")
    .select("results")
    .eq("zip", zip)
    .eq("radius_km", WIDE_KM)
    .eq("sport", sport)
    .maybeSingle();
  if (cacheRow) {
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
      });
    }
  }

  const courts = [...byKey.values()].sort((a, b) => {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return { status: courts.length ? "ok" : "empty", courts, source: cacheRow ? "mixed" : "directory" };
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

/* Courts page "Create a match" button: persist the court, then drop the
 * organizer into the create flow with it pre-filled. */
export async function startMatchAtCourt(input: GoogleCourtInput): Promise<{ error?: string }> {
  const { courtId, error } = await upsertGoogleCourt(input);
  if (error || !courtId) return { error: error ?? "Could not start a match here." };
  const sport = SPORT_KEYS.includes(input.sport) ? input.sport : "";
  redirect(`/play/new?court=${courtId}${sport ? `&sport=${sport}` : ""}`);
}
