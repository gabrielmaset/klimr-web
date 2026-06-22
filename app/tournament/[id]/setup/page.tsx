import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentSetupWizard } from "@/components/tournament-setup-wizard";
import type { TournamentFormatConfig, FormatType } from "@/lib/tournament";

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/setup`);

  // The workspace layout already guarded owner/manager access.
  const { data: t } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();

  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const legal = fc.legal ?? {};
  const init = {
    id: t.id,
    code: t.code,
    status: t.status,
    title: t.title ?? "",
    summary: t.summary ?? "",
    description: t.description ?? "",
    sport_key: t.sport_key,
    entry_type: (t.entry_type === "individual" ? "individual" : "team") as "individual" | "team",
    visibility: (t.visibility === "unlisted" ? "unlisted" : "public") as "public" | "unlisted",
    starts_at: t.starts_at,
    ends_at: t.ends_at,
    timezone: t.timezone,
    location_name: t.location_name,
    location_address: t.location_address,
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
    waiver_text: legal.waiver_text ?? "",
    rules_text: legal.rules_text ?? "",
    require_waiver: !!legal.require_waiver,
    require_rules: !!legal.require_rules,
  };
  const startStep = step ? Math.max(0, Math.min(parseInt(step, 10) || 0, 5)) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Set up</p>
        <h1 className="truncate font-display text-3xl leading-none text-ink sm:text-4xl">{t.title || "Your tournament"}</h1>
      </div>
      <TournamentSetupWizard init={init} startStep={startStep} />
    </div>
  );
}
