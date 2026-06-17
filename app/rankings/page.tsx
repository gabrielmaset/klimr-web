import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RankingsBoard } from "./rankings-board";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rankings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_hue, home_zip, city, state, country, primary_sport")
    .eq("id", user.id)
    .single();

  // Default the active tab to a sport the player actually has a ranking in,
  // falling back to their primary sport, then tennis.
  const { data: mine } = await supabase
    .from("player_sports")
    .select("sport_key, points")
    .eq("user_id", user.id)
    .order("points", { ascending: false });

  const initialSportKey = profile?.primary_sport ?? mine?.[0]?.sport_key ?? "tennis";

  return (
    <RankingsBoard
      userId={user.id}
      initialSportKey={initialSportKey}
      profile={{
        name: profile?.display_name || "You",
        hue: profile?.avatar_hue ?? 200,
        zip: profile?.home_zip ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        country: profile?.country ?? "US",
      }}
    />
  );
}
