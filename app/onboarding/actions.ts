"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const zip = String(formData.get("zip") || "").trim();
  const sport = String(formData.get("sport") || "").trim();

  if (!/^\d{5}$/.test(zip)) {
    return { error: "Enter a 5-digit ZIP code." };
  }
  if (!sport) {
    return { error: "Pick your primary sport." };
  }

  // Resolve the ZIP to a region, if we have it mapped.
  const { data: region } = await supabase
    .from("zip_regions")
    .select("neighborhood, city, state, country")
    .eq("zip", zip)
    .maybeSingle();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      home_zip: zip,
      neighborhood: region?.neighborhood ?? null,
      city: region?.city ?? null,
      state: region?.state ?? null,
      country: region?.country ?? "US",
      primary_sport: sport,
    })
    .eq("id", user.id);
  if (profileError) {
    return { error: "Could not save your profile. Try again in a moment." };
  }

  // Create the player's ranking row (zeroed; RLS permits self-insert with zeroed stats).
  const { error: sportError } = await supabase.from("player_sports").upsert(
    { user_id: user.id, sport_key: sport, points: 0, matches_played: 0, wins: 0 },
    { onConflict: "user_id,sport_key", ignoreDuplicates: true },
  );
  if (sportError) {
    return { error: "Could not set your sport. Try again in a moment." };
  }

  redirect(region ? "/account" : "/account?note=area");
}
