import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageIcon, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";
import { AvatarUploader } from "@/components/avatar-uploader";
import { ProfileBasicsForm, type ProfileInitial } from "./profile-form";

export const metadata: Metadata = { title: "Profile & bio · Settings" };

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  const { data: p } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name, bio, gender, date_of_birth, home_zip, avatar_hue, avatar_path, timezone, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  const initial: ProfileInitial = {
    first_name: p?.first_name ?? "",
    last_name: p?.last_name ?? "",
    bio: p?.bio ?? "",
    timezone: p?.timezone ?? null,
    identityLocked: p?.verification_status === "verified",
    gender: p?.gender ?? "",
    dob: p?.date_of_birth ?? "",
    zip: p?.home_zip ?? "",
  };
  const hue = p?.avatar_hue ?? 18;
  const name = p?.display_name || user.email || "Player";
  const photoUrl = p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Profile" }]} />
      <BackButton fallback="/settings" label="Settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink" />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Profile &amp; bio</h1>
      <p className="mt-2 text-sm text-mute">Your photo, name, bio, date of birth, and home area — everything on your public profile.</p>

      {/* Profile photo */}
      <div className="mt-6 rounded-2xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-ink">Profile photo</h2>
        <AvatarUploader initialPhotoUrl={photoUrl} hue={hue} name={name} />
      </div>

      {/* Cover photo — edited inline on the public profile */}
      <Link href="/me" className="lift mt-4 flex items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-ink">
          <ImageIcon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Cover photo</span>
          <span className="block text-xs text-mute">Add or change your cover banner from your profile</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-faint" />
      </Link>

      {/* Name, bio, and the rest */}
      <div className="mt-4 rounded-2xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
        <ProfileBasicsForm initial={initial} />
      </div>
    </div>
  );
}
