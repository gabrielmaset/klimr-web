import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProfileBasicsForm, type ProfileInitial } from "./profile-form";
import { PresenceControl } from "../presence-control";
import type { PresenceMode } from "@/app/account/presence";

export const metadata: Metadata = { title: "Profile & bio · Settings" };

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  const { data: p } = await supabase
    .from("profiles")
    .select("first_name, last_name, bio, gender, date_of_birth, home_zip")
    .eq("id", user.id)
    .maybeSingle();

  const initial: ProfileInitial = {
    first_name: p?.first_name ?? "",
    last_name: p?.last_name ?? "",
    bio: p?.bio ?? "",
    gender: p?.gender ?? "",
    dob: p?.date_of_birth ?? "",
    zip: p?.home_zip ?? "",
  };
  // Separate read so this page still works before migration 0047 is applied.
  const { data: pm } = await supabase.from("profiles").select("presence_mode").eq("id", user.id).maybeSingle();
  const presenceMode = (pm?.presence_mode as PresenceMode) ?? "auto";

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <Link href="/settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ChevronLeft size={16} /> Settings
      </Link>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Profile &amp; bio</h1>
      <p className="mt-2 text-sm text-mute">Your name, bio, date of birth, and home area.</p>

      <Link href="/me" className="lift mt-5 flex items-center gap-3 rounded-xl border border-rule bg-surface p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink"><ImageIcon size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Photo &amp; cover</span>
          <span className="block text-xs text-mute">Update your profile photo and cover from your profile</span>
        </span>
        <ChevronLeft size={16} className="shrink-0 rotate-180 text-faint" />
      </Link>

      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5 sm:p-6">
        <ProfileBasicsForm initial={initial} />
      </div>

      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-ink">Online status</h2>
        <p className="mt-1 text-xs text-mute">Sets the status dot others see. You can also switch it anytime from the status pill in your top bar.</p>
        <div className="mt-4">
          <PresenceControl initialMode={presenceMode} />
        </div>
      </div>
    </div>
  );
}
