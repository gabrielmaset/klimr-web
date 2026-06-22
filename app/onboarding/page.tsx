import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard, type WizardInitial } from "./onboarding-form";

export const metadata: Metadata = { title: "Your profile" };

type RawRange = { day?: unknown; start?: unknown; end?: unknown };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step: stepRaw } = await searchParams;
  const startStep = Number.isFinite(Number(stepRaw)) ? Math.trunc(Number(stepRaw)) : 0;
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
          "display_name, first_name, last_name, home_zip, primary_sport, bio, gender, birth_year, date_of_birth, availability, avatar_hue, play_style",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("player_sports")
        .select("sport_key, skill_level, skill_rating, preferred_format, handedness")
        .eq("user_id", user.id),
    ]);

  const isEdit = Boolean(profile?.primary_sport && profile?.home_zip);

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

  const initial: WizardInitial = {
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    zip: profile?.home_zip ?? "",
    bio: profile?.bio ?? "",
    gender: profile?.gender ?? "",
    dob: profile?.date_of_birth ?? "",
    hue: profile?.avatar_hue ?? 200,
    availability,
    playStyle: profile?.play_style ?? "both",
    sports: (mySports ?? []).map((s) => ({
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
      <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:gap-14">
        {/* left rail — heading + reassurance, sticky on desktop */}
        <div className="lg:sticky lg:top-24">
          <p className="kicker text-brand-deep">{isEdit ? "Your profile" : "Almost in"}</p>
          <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
            {isEdit ? (
              <>Edit your <span className="italic">profile.</span></>
            ) : (
              <>Build your <span className="italic">profile.</span></>
            )}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-mute">
            {isEdit
              ? "Everything here can change as your game does — update a rating, add a sport, reset your times."
              : "Five quick steps and your spot on the board is reserved. It all stays editable later."}
          </p>
          <ul className="mt-6 hidden space-y-2.5 lg:block">
            {[
              "Takes about two minutes",
              "Each sport gets its own ranking",
              "Nothing here is locked in",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm text-ink-soft">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* right — the wizard, in a card that fills the column */}
        <div className="rounded-3xl border border-rule bg-surface p-6 shadow-[0_1px_0_rgba(10,10,11,0.02)] sm:p-8">
          <OnboardingWizard sports={sports ?? []} initial={initial} isEdit={isEdit} startStep={startStep} />
        </div>
      </div>
    </div>
  );
}
