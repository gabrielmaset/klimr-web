import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard, type WizardInitial } from "./onboarding-form";

export const metadata: Metadata = { title: "Your profile" };

type RawRange = { day?: unknown; start?: unknown; end?: unknown };

export default async function OnboardingPage() {
  // Onboarding is a sealed flow: the user always enters at the first step. The
  // wizard tracks its position in its own client state and never reads it from
  // the URL, so a typed or deep link like /onboarding?step=4 can't drop someone
  // into the middle of the process — they land at the front door.
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
          "display_name, first_name, last_name, home_zip, primary_sport, bio, gender, birth_year, date_of_birth, availability, avatar_hue, play_style, onboarding_draft, verification_status",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("player_sports")
        .select("sport_key, skill_level, skill_rating, preferred_format, handedness")
        .eq("user_id", user.id),
    ]);

  const isEdit = Boolean(profile?.primary_sport && profile?.home_zip);

  // One-time flow: onboarding runs only while the profile is still incomplete.
  // Once it's set up, editing belongs on the Settings pages — so a completed
  // profile that lands here (typed URL, old link) is sent there instead.
  if (isEdit) redirect("/settings/profile");

  // availability is JSONB. New shape is an array of { day, start, end } ranges.
  // Any legacy entries (the old "mon-eve" slot ids) are dropped gracefully.
  const availability = Array.isArray(profile?.availability)
    ? (profile!.availability as RawRange[])
        .filter(
          (r) =>
            !!r &&
            typeof r === "object" &&
            typeof r.day === "string" &&
            typeof r.start === "string" &&
            typeof r.end === "string",
        )
        .map((r) => ({
          day: String(r.day),
          start: String(r.start),
          end: String(r.end),
        }))
    : [];

  // A saved draft (autosnapshotted each step) beats the profile row — it is
  // strictly newer for an unfinished signup.
  type Draft = Partial<{
    firstName: string; lastName: string; zip: string; dob: string; gender: string;
    hue: number; bio: string; style: string;
    availability: { day: string; start: string; end: string }[];
    sports: { key: string; level: string; primary: boolean; rating: string; format: string; hand: string }[];
    verifyRequested: boolean;
  }>;
  const draft = (profile?.onboarding_draft ?? null) as Draft | null;

  const initial: WizardInitial = {
    firstName: draft?.firstName ?? profile?.first_name ?? "",
    lastName: draft?.lastName ?? profile?.last_name ?? "",
    zip: draft?.zip ?? profile?.home_zip ?? "",
    bio: draft?.bio ?? profile?.bio ?? "",
    gender: draft?.gender ?? profile?.gender ?? "",
    dob: draft?.dob ?? profile?.date_of_birth ?? "",
    hue: draft?.hue ?? profile?.avatar_hue ?? 200,
    availability: draft?.availability ?? availability,
    playStyle: draft?.style ?? profile?.play_style ?? "both",
    verifyRequested: draft?.verifyRequested || profile?.verification_status === "pending",
    sports:
      draft?.sports && draft.sports.length
        ? draft.sports
        : (mySports ?? []).map((s) => ({
            key: s.sport_key,
            level: s.skill_level ?? "casual",
            primary: s.sport_key === profile?.primary_sport,
            rating: s.skill_rating != null ? String(s.skill_rating) : "",
            format: s.preferred_format ?? "both",
            hand: s.handedness ?? "",
          })),
  };

  return (
    <div className="mx-auto max-w-page px-5 py-12 lg:py-16">
      <OnboardingWizard sports={sports ?? []} initial={initial} isEdit={isEdit} startStep={0} />
        </div>
  );
}
