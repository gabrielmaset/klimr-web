import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentSettingsEditor, type SettingsInit } from "@/components/tournament-settings-editor";
import { GalleryEditor } from "@/components/gallery-editor";
import { DeleteEvent } from "@/components/tournament-delete";
import { isSignupFormReady, type TournamentFormatConfig, type FormatType } from "@/lib/tournament";

export default async function TournamentSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/settings`);

  // The workspace layout already guarded owner/manager access.
  const { data: t } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const isOwner = t.owner_id === user.id;

  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const legal = fc.legal ?? {};
  const { count: cfCount } = await supabase.from("tournament_custom_fields").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  const signupFormReady = isSignupFormReady(fc, cfCount ?? 0);
  const init: SettingsInit = {
    id: t.id,
    code: t.code,
    status: t.status,
    title: t.title ?? "",
    summary: t.summary ?? "",
    description: t.description ?? "",
    sport_key: t.sport_key,
    entry_type: t.entry_type === "individual" ? "individual" : "team",
    visibility: t.visibility === "unlisted" ? "unlisted" : "public",
    starts_at: t.starts_at,
    ends_at: t.ends_at,
    timezone: t.timezone,
    location_name: t.location_name,
    location_address: t.location_address,
    location_zip: t.location_zip ?? null,
    weather_enabled: !!t.weather_enabled,
    capacity: t.capacity,
    reserves_allowed: t.reserves_allowed ?? 0,
    min_women: t.min_women ?? 0,
    min_men: t.min_men ?? 0,
    registration_opens_at: t.registration_opens_at,
    registration_deadline: t.registration_deadline,
    format_type: (fc.format_type ?? "pools_knockout") as FormatType,
    pool_count: fc.pool_count ?? 2,
    roster_size: fc.roster_size ?? 2,
    courts: Array.isArray(fc.courts) ? fc.courts : null,
    waiver_text: legal.waiver_text ?? "",
    rules_text: legal.rules_text ?? "",
    require_waiver: !!legal.require_waiver,
    require_rules: !!legal.require_rules,
    signupFormReady,
    public_bg: fc.public_bg ?? "default",
    capacity_mode: fc.capacity_mode === "per_division" ? "per_division" : "pooled",
    capacity_unit: fc.capacity_unit === "person" ? "person" : "team",
  };

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Setup</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-mute">Edit any part of your event — changes save section by section, anytime.</p>
      </div>

      <TournamentSettingsEditor init={init} />

      <section className="mt-4 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink">Event photos</h2>
        <p className="mb-4 mt-0.5 text-sm text-mute">A gallery on your public page — add shots from past tournaments, the venue, or the crowd.</p>
        <GalleryEditor tournamentId={t.id} initial={Array.isArray(fc.gallery) ? fc.gallery : []} />
      </section>

      <div className="mt-4">
        {isOwner ? (
          <DeleteEvent id={t.id} title={t.title} />
        ) : (
          <section className="rounded-3xl border border-rule bg-surface p-5 text-sm text-mute">Only the event owner can delete this event.</section>
        )}
      </div>
    </div>
  );
}
