import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Trophy } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";
import { TournamentSetupWizard } from "@/components/tournament-setup-wizard";
import type { FormatType } from "@/lib/tournament";

export const metadata: Metadata = { title: "Host a tournament" };

export default async function NewTournamentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tournaments/new");

  const { data: prof } = await supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle();
  const verified = prof?.verification_status === "verified";

  // A blank draft to seed the create-at-end wizard. Nothing is written to the
  // database until the organizer reaches the end and presses "Create event".
  const init = {
    title: "",
    summary: "",
    description: "",
    sport_key: "beach_volleyball",
    entry_type: "team" as const,
    visibility: "public" as const,
    starts_at: null,
    ends_at: null,
    timezone: null,
    location_name: null,
    location_address: null,
    weather_enabled: false,
    capacity: null,
    reserves_allowed: 0,
    min_women: 0,
    min_men: 0,
    registration_opens_at: null,
    registration_deadline: null,
    format_type: "pools_knockout" as FormatType,
    pool_count: 2,
    roster_size: 2,
    waiver_text: "",
    rules_text: "",
    require_waiver: false,
    require_rules: false,
  };

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <BackButton fallback="/tournaments" label="Tournaments" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink" icon="arrow" />

      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <Trophy size={20} />
        </span>
        <div>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Host a tournament</h1>
          <p className="mt-1 text-sm text-mute">Set it up step by step. Nothing is saved until you finish — and your event stays private until you publish it.</p>
        </div>
      </div>

      {!verified ? (
        <section className="mt-6 flex items-start gap-3 rounded-2xl border border-rule bg-surface p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">Get verified to host</h2>
            <p className="mt-0.5 text-sm text-mute">Hosting is available to verified players, so every organizer on Klimr is a real, accountable person. Verify your identity to unlock it.</p>
            <Link href="/settings/verification?need=host" className="mt-2 inline-block text-sm font-semibold text-brand-deep hover:underline">
              Verify my account →
            </Link>
          </div>
        </section>
      ) : (
        <div className="mt-6">
          <TournamentSetupWizard init={init} />
        </div>
      )}
    </div>
  );
}
