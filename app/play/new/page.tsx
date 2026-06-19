import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
import { CreateMatchForm } from "./create-form";
import type { PickerCourt } from "@/app/courts/search-actions";

export const metadata: Metadata = { title: "Organize a match" };

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ court?: string; sport?: string }>;
}) {
  const { court: courtId, sport: sportParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/play/new");

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_zip, primary_sport")
    .eq("id", user.id)
    .maybeSingle();

  const defaultZip = (profile?.home_zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);
  const defaultSport =
    sportParam && SPORT_KEYS.includes(sportParam)
      ? sportParam
      : profile?.primary_sport && SPORT_KEYS.includes(profile.primary_sport)
        ? profile.primary_sport
        : "";

  // Pre-fill a court when arriving from the Courts page ("Create a match").
  let initialCourt: PickerCourt | null = null;
  if (courtId) {
    const { data: c } = await supabase
      .from("courts")
      .select("id, name, sports, address, neighborhood, city, lat, lng, rating, rating_count, is_private, google_place_id")
      .eq("id", courtId)
      .maybeSingle();
    if (c) {
      const place = [c.neighborhood, c.city].filter(Boolean).join(", ");
      initialCourt = {
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
        sport: defaultSport || c.sports?.[0] || "",
        distanceKm: null,
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <Link href="/play" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> All matches
      </Link>
      <h1 className="mt-4 font-display text-4xl leading-none text-ink sm:text-5xl">Organize a match</h1>
      <p className="mt-1 text-sm text-mute">Set the where and when. Players nearby can join until it fills.</p>
      <CreateMatchForm defaultZip={defaultZip} defaultSport={defaultSport} initialCourt={initialCourt} />
    </div>
  );
}
