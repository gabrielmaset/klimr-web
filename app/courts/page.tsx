import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
import { CourtsExplorer } from "./courts-explorer";

export const metadata: Metadata = { title: "Courts" };

export default async function CourtsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/courts");

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_zip, primary_sport")
    .eq("id", user.id)
    .maybeSingle();

  const defaultZip = (profile?.home_zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);
  const defaultSport = profile?.primary_sport && SPORT_KEYS.includes(profile.primary_sport) ? profile.primary_sport : "tennis";
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-4">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Courts</h1>
        <p className="mt-1 text-sm text-mute">
          Find courts near any ZIP — screened by Klimr so you get real, active places to play.
        </p>
      </div>
      <CourtsExplorer defaultZip={defaultZip} defaultSport={defaultSport} mapboxToken={mapboxToken} />
    </div>
  );
}
