"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { SPORT_KEYS } from "@/lib/sports";

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
 *   COURTS_CACHE_TTL_DAYS           default 14
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
};

const QUERY_FOR: Record<string, string> = {
  tennis: "tennis court",
  pickleball: "pickleball court",
  padel: "padel court",
  racquetball: "racquetball court",
};

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

/* Geocode a US ZIP to a centroid, caching the result forever. */
async function geocodeZip(
  admin: ReturnType<typeof createAdminClient>,
  zip: string,
  key: string,
): Promise<{ lat: number; lng: number } | null> {
  const { data: cached } = await admin.from("zip_geocode").select("lat, lng").eq("zip", zip).maybeSingle();
  if (cached) return { lat: cached.lat, lng: cached.lng };

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      zip,
    )}&components=country:US|postal_code:${encodeURIComponent(zip)}&key=${key}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    await admin.from("zip_geocode").upsert({ zip, lat: loc.lat, lng: loc.lng }, { onConflict: "zip" });
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
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
    if (!resp.ok) return null;
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
  } catch {
    return null;
  }
}

export async function searchCourts(input: { zip: string; radiusKm: number; sport: string }): Promise<SearchResponse> {
  const zip = String(input.zip ?? "").trim();
  const sport = String(input.sport ?? "");
  const radiusKm = Math.max(1, Math.min(50, Math.round(input.radiusKm)));

  if (!/^\d{5}$/.test(zip) || !SPORT_KEYS.includes(sport)) {
    return { status: "bad_input", courts: [], source: "none", message: "Enter a 5-digit ZIP and pick a sport." };
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!googleKey || !anthropicKey) {
    return { status: "not_configured", courts: [], source: "none" };
  }

  const admin = createAdminClient();
  const ttlDays = num(process.env.COURTS_CACHE_TTL_DAYS, 14);
  const cap = num(process.env.COURTS_MONTHLY_LIVE_SEARCH_CAP, 800);
  const model = process.env.COURTS_AI_MODEL || "claude-haiku-4-5-20251001";

  // 1) Fresh cache hit → free.
  const { data: cacheRow } = await admin
    .from("court_search_cache")
    .select("results, fetched_at")
    .eq("zip", zip)
    .eq("radius_km", radiusKm)
    .eq("sport", sport)
    .maybeSingle();
  if (cacheRow) {
    const ageMs = Date.now() - new Date(cacheRow.fetched_at).getTime();
    if (ageMs < ttlDays * 86_400_000) {
      const courts = (cacheRow.results as unknown as CourtResult[]) ?? [];
      return { status: courts.length ? "ok" : "empty", courts, source: "cache" };
    }
  }

  // 2) Claim a live search slot under the monthly cap (atomic). If we're capped,
  //    serve stale cache if we have any, otherwise tell the user.
  const month = new Date().toISOString().slice(0, 7);
  const { data: claimed } = await admin.rpc("claim_live_search", { p_month: month, p_cap: cap });
  if (claimed !== true) {
    if (cacheRow) {
      const courts = (cacheRow.results as unknown as CourtResult[]) ?? [];
      return {
        status: courts.length ? "ok" : "empty",
        courts,
        source: "cache",
        message: "Showing recent results — live search is paused until next month.",
      };
    }
    return { status: "capped", courts: [], source: "none", message: "Live court search has hit this month's limit. Try again next month." };
  }

  // 3) Geocode → Places → pre-filter → AI.
  const center = await geocodeZip(admin, zip, googleKey);
  if (!center) return { status: "no_location", courts: [], source: "none", message: "Couldn't locate that ZIP code." };

  let candidates: RawPlace[] = [];
  try {
    candidates = await placesSearch(QUERY_FOR[sport] ?? `${sport} court`, center.lat, center.lng, radiusKm, googleKey);
  } catch {
    return { status: "error", courts: [], source: "none", message: "Search is temporarily unavailable." };
  }

  let courts: CourtResult[];
  if (candidates.length === 0) {
    courts = [];
  } else {
    const verdicts = await aiFilter(candidates, sport, model, anthropicKey);
    courts = candidates
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

  // 4) Cache the result set.
  await admin
    .from("court_search_cache")
    .upsert(
      { zip, radius_km: radiusKm, sport, results: courts, fetched_at: new Date().toISOString() },
      { onConflict: "zip,radius_km,sport" },
    );

  return { status: courts.length ? "ok" : "empty", courts, source: "live" };
}
