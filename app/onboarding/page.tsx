import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard, type WizardInitial } from "./onboarding-form";

export const metadata: Metadata = { title: "Your profile" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: sports }, { data: profile }, { data: mySports }] =
    await Promise.all([
      supabase.from("sports").select("key, name, skill_system").order("name"),
      supabase
        .from("profiles")
        .select(
          "display_name, home_zip, primary_sport, bio, gender, birth_year, availability, avatar_hue, preferred_format, play_style, handedness",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("player_sports")
        .select("sport_key, skill_level, skill_rating")
        .eq("user_id", user.id),
    ]);

  const isEdit = Boolean(profile?.primary_sport && profile?.home_zip);

  const initial: WizardInitial = {
    displayName:
      profile?.display_name && !profile.display_name.includes("@")
        ? profile.display_name
        : "",
    zip: profile?.home_zip ?? "",
    bio: profile?.bio ?? "",
    gender: profile?.gender ?? "",
    birthYear: profile?.birth_year ? String(profile.birth_year) : "",
    hue: profile?.avatar_hue ?? 200,
    availability: Array.isArray(profile?.availability)
      ? (profile.availability as string[])
      : [],
    preferredFormat: profile?.preferred_format ?? "both",
    playStyle: profile?.play_style ?? "both",
    handedness: profile?.handedness ?? "",
    sports: (mySports ?? []).map((s) => ({
      key: s.sport_key,
      level: s.skill_level ?? "casual",
      primary: s.sport_key === profile?.primary_sport,
      rating: s.skill_rating != null ? String(s.skill_rating) : "",
    })),
  };

  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <p className="kicker text-brand-deep">{isEdit ? "Your profile" : "Almost in"}</p>
      <h1 className="mt-2 font-display text-4xl text-ink">
        {isEdit ? (
          <>Edit your <span className="italic">profile.</span></>
        ) : (
          <>Build your <span className="italic">profile.</span></>
        )}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        {isEdit
          ? "Everything here can change as your game does."
          : "Five quick steps and your spot on the board is reserved."}
      </p>
      <div className="mt-7">
        <OnboardingWizard sports={sports ?? []} initial={initial} isEdit={isEdit} />
      </div>
    </div>
  );
}
