import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
import { CourtsExplorer } from "../courts-explorer";

export const metadata: Metadata = { title: "Suggest a court" };

/** Suggest a court — the original Google-powered search, which is also the
 *  ingestion pipeline: picking a result saves it to the courts table, where a
 *  Klimr player confirms it before it appears in the finder. */
export default async function SuggestCourtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/courts/suggest");

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_zip, primary_sport")
    .eq("id", user.id)
    .maybeSingle();

  const defaultZip = (profile?.home_zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);
  const defaultSport = profile?.primary_sport && SPORT_KEYS.includes(profile.primary_sport) ? profile.primary_sport : "tennis";

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Discover — Suggest a court</p>
        <h1 className="mt-1.5 font-display text-[32px] font-bold leading-none tracking-[-0.025em] text-ink">Suggest a court</h1>
        <p className="mt-1 text-sm text-mute">
          Search any place worldwide — picking a result adds it to Klimr for confirmation, and it appears in the finder once a player verifies it.
        </p>
      </div>
      <CourtsExplorer defaultZip={defaultZip} defaultSport={defaultSport} mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null} />
    </div>
  );
}
