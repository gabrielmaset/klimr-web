import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentSettingsEditor, type SettingsInit } from "@/components/tournament-settings-editor";
import { GalleryEditor } from "@/components/gallery-editor";
import { DivisionsEditor } from "@/components/tournament-divisions-editor";
import { Trash2, RotateCcw } from "lucide-react";
import { DangerConfirm } from "@/components/danger-confirm";
import { cancelTournamentById, reopenTournament } from "@/app/tournaments/actions";
import { withinRecoverWindow, recoverDaysLeft } from "@/lib/recover";
import { isSignupFormReady, type TournamentFormatConfig, type FormatType, type DivisionRow } from "@/lib/tournament";

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
  const { data: divs } = await supabase
    .from("tournament_divisions")
    .select("id, name, description, fee_cents, fee_basis, capacity, sort_order")
    .eq("tournament_id", id)
    .order("sort_order");
  const entryType = t.entry_type === "individual" ? "individual" : "team";
  const capMode: "pooled" | "per_division" = fc.capacity_mode === "per_division" ? "per_division" : "pooled";
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
    location_url: t.location_url,
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

      <TournamentSettingsEditor
        init={init}
        divisionsSlot={
          <section id="divisions" className="scroll-mt-24 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold tracking-tight text-ink">Divisions &amp; fees</h2>
            <p className="mb-4 mt-0.5 text-sm text-mute">The categories {entryType === "team" ? "teams" : "players"} enter and what each costs.</p>
            <DivisionsEditor tournamentId={t.id} entryType={entryType} initial={(divs as DivisionRow[]) ?? []} initialMode={capMode} />
          </section>
        }
        gallerySlot={
          <section className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
            <h2 className="text-base font-bold text-ink">Event photos</h2>
            <p className="mb-4 mt-0.5 text-sm text-mute">A gallery on your public page — add shots from past tournaments, the venue, or the crowd.</p>
            <GalleryEditor tournamentId={t.id} initial={Array.isArray(fc.gallery) ? fc.gallery : []} />
          </section>
        }
        dangerSlot={
          isOwner ? (
            <section className="rounded-3xl border border-[#f5b8a6] bg-[#fff5f1] p-5 sm:p-6">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#dc2626]"><Trash2 size={15} /> Danger zone</h2>
              {t.cancelled_at ? (
                withinRecoverWindow(t.cancelled_at) ? (
                  <>
                    <p className="mt-1 text-sm text-ink-soft">This tournament is cancelled and hidden from discovery. Nothing was deleted \u2014 recover it while you still can.</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <form action={reopenTournament}>
                        <input type="hidden" name="tournamentId" value={t.id} />
                        <button className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"><RotateCcw size={15} /> Recover tournament</button>
                      </form>
                      <span className="text-xs text-mute">Recoverable for {recoverDaysLeft(t.cancelled_at)} more day{recoverDaysLeft(t.cancelled_at) === 1 ? "" : "s"}, then archived.</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-soft">This tournament is cancelled. The 90-day recovery window has passed \u2014 it is archived and its data is kept.</p>
                )
              ) : (
                <>
                  <p className="mt-1 text-sm text-ink-soft">Cancelling stops sign-ups and hides the tournament from discovery. Nothing is deleted \u2014 registrations, divisions, brackets, and payments are kept, and you can recover it for 90 days.</p>
                  <div className="mt-4">
                    <DangerConfirm
                      word="CANCEL"
                      triggerLabel="Cancel this tournament"
                      triggerIcon={<Trash2 size={15} />}
                      triggerClassName="press inline-flex items-center gap-1.5 rounded-xl border border-[#dc2626]/50 bg-surface px-4 py-2.5 text-sm font-semibold text-[#dc2626] transition-colors hover:bg-[#fef2f2]"
                      heading="Cancel this tournament?"
                      description="Sign-ups stop and it disappears from discovery. Nothing is deleted \u2014 you can recover it for 90 days."
                      consequences={["Registrations, divisions, brackets, and payments are all kept", "It won\u2019t appear in public listings", "Recoverable for 90 days, then archived read-only"]}
                      confirmLabel="Cancel tournament"
                      onConfirm={cancelTournamentById.bind(null, t.id)}
                    />
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="rounded-3xl border border-rule bg-surface p-5 text-sm text-mute">Only the event owner can cancel this event.</section>
          )
        }
      />
    </div>
  );
}
