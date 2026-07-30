import { after } from "next/server";
import { scanZipForCourts } from "./search-actions";

const nowMs = () => Date.now();
import { SPORT_KEYS } from "@/lib/sports";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupZip } from "@/lib/us-places";
import { geocodeAddress } from "@/lib/maps-url";
import { CourtsFinder, type FinderCourt } from "./courts-finder";

export const metadata: Metadata = { title: "Courts" };

const RADII = [3, 5, 10, 25];

/** Courts — the map-based finder. Server side: read every filter from the URL,
 *  geocode the origin (local ZIP table first, Google for city text), run ONE
 *  set-based courts_finder() pass, and hand the radius set to the client. All
 *  narrowing (sport/venue/amenities/sort) happens client-side over that set so
 *  the controls feel instant while the URL stays canonical and shareable. */
export default async function CourtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/courts");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_zip, primary_sport")
    .eq("id", user.id)
    .maybeSingle();

  const rawQuery = (one("zip") ?? profile?.home_zip ?? "").trim();
  // The finder opens on the player's own sport, not "All sports".
  const defaultSport = profile?.primary_sport && SPORT_KEYS.includes(profile.primary_sport) ? profile.primary_sport : "all";
  const sportParam = one("sport") ?? defaultSport;
  const radius = RADII.includes(Number(one("radius"))) ? Number(one("radius")) : 10;

  // Origin: 5-digit ZIP through the local table (instant, free); anything else
  // through geocoding. No origin → the finder renders its search-first state.
  let origin: { lat: number; lng: number } | null = null;
  let originLabel = rawQuery;
  const zipHit = /^\d{5}$/.test(rawQuery) ? lookupZip(rawQuery) : null;
  if (zipHit) {
    origin = { lat: zipHit.lat, lng: zipHit.lng };
    originLabel = rawQuery;
  } else if (rawQuery.length >= 3) {
    const g = await geocodeAddress(rawQuery);
    if (g) {
      origin = g;
      originLabel = rawQuery;
    }
  }

  const loadCourts = async (): Promise<FinderCourt[]> => {
    if (!origin) return [];
    const { data } = await supabase.rpc("courts_finder", {
      p_lat: origin.lat,
      p_lng: origin.lng,
      p_radius_mi: radius,
    });
    return (data ?? []).map((r) => {
      // Both rating sources travel to the card — Klimr reviews lead, Google
      // fills the gap; the card renders whichever exist (or neither).
      const recent = Array.isArray(r.recent_players)
        ? (r.recent_players as { id: string; name: string; hue: number }[]).slice(0, 3)
        : [];
      return {
        id: r.id,
        name: r.name,
        area: r.area ?? r.city ?? "",
        lat: r.lat,
        lng: r.lng,
        sports: r.sports ?? [],
        courtCount: r.court_count,
        indoor: r.indoor,
        lights: r.lights,
        free: r.free,
        memberRating: (r.member_review_count ?? 0) > 0 && r.member_rating != null ? Number(r.member_rating) : null,
        memberReviewCount: r.member_review_count ?? 0,
        googleRating: (r.google_rating_count ?? 0) > 0 && r.google_rating != null ? Number(r.google_rating) : null,
        googleRatingCount: r.google_rating_count ?? 0,
        liveQueue: r.live_queue,
        activePlayers: r.active_player_count ?? 0,
        recent,
        busy: r.busy === "BUSY" || r.busy === "MODERATE" || r.busy === "QUIET" ? r.busy : null,
        distanceMi: Math.round(r.distance_mi * 10) / 10,
      };
    });
  };
  const courts = await loadCourts();

  // Coverage expansion — the industry pattern: the page answers INSTANTLY
  // from Klimr's own index; Google ingestion runs AFTER the response (never
  // blocking a render), and the finder auto-refreshes once to reveal what
  // arrived. Under "All sports" every sport is covered (30-day log-gated per
  // zip+sport), not a hand-picked pair — the reason Padel showed 0 under All
  // but 9 when searched directly.
  let scanKicked = false;
  if (origin && zipHit) {
    const wanted = sportParam !== "all" ? [sportParam] : [...SPORT_KEYS];
    const { data: logRows } = await createAdminClient()
      .from("courts_scan_log")
      .select("sport, scanned_at")
      .eq("zip", rawQuery)
      .in("sport", wanted);
    const freshSet = new Set(
      (logRows ?? []).filter((l) => Date.parse(l.scanned_at) > nowMs() - 30 * 86_400_000).map((l) => l.sport),
    );
    const stale = wanted.filter((s) => !freshSet.has(s));
    if (stale.length) {
      scanKicked = true;
      const zip = rawQuery;
      const rad = radius;
      after(async () => {
        try {
          const added = await scanZipForCourts(zip, stale, rad);
          console.error("[courts scan] background complete", zip, `+${added} courts`, `sports:${stale.length}`);
        } catch (e) {
          console.error("[courts scan] background failed", zip, e instanceof Error ? e.message : e);
        }
      });
    }
  }

  // Header pulse: open Live Queue sessions right now, platform-wide.
  const { count: liveNow } = await createAdminClient()
    .from("court_sessions")
    .select("id", { count: "exact", head: true })
    .is("ended_at", null)
    .gt("activated_at", new Date(nowMs() - 12 * 3_600_000).toISOString());

  return (
    <CourtsFinder
      initial={{
        zip: rawQuery,
        radius,
        sport: sportParam,
        venue: one("venue") === "indoor" || one("venue") === "outdoor" ? (one("venue") as "indoor" | "outdoor") : "any",
        lights: one("lights") === "1",
        free: one("free") === "1",
        queue: one("queue") === "1",
        sort: ["active", "rated", "courts"].includes(one("sort") ?? "") ? (one("sort") as "active" | "rated" | "courts") : "nearest",
      }}
      courts={courts}
      origin={origin}
      originLabel={originLabel}
      liveQueuesNow={liveNow ?? 0}
      scanKicked={scanKicked}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null}
    />
  );
}
