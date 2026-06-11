import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sports } = await supabase
    .from("sports")
    .select("key, name")
    .order("name");

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">Almost in</p>
      <h1 className="mt-2 font-display text-4xl text-ink">
        Set up your <span className="italic">profile.</span>
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Two quick things and your spot on the board is reserved.
      </p>
      <div className="mt-7">
        <OnboardingForm sports={sports ?? []} />
      </div>
    </div>
  );
}
