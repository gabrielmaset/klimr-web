import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrizesEditor } from "@/components/prizes-editor";
import type { TournamentFormatConfig, Prize } from "@/lib/tournament";

export default async function PrizesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/prizes`);

  const { data: t } = await supabase.from("tournaments").select("id, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const prizes: Prize[] = Array.isArray(fc.prizes) ? fc.prizes : [];

  const { data: divs } = await supabase.from("tournament_divisions").select("id, name").eq("tournament_id", id).order("sort_order");

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Promotion</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Prizes</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">Show players what they&apos;re competing for. Prizes appear on your public page, grouped by division.</p>
      </div>
      <PrizesEditor tournamentId={t.id} initial={prizes} divisions={(divs ?? []).map((d) => ({ id: d.id, name: d.name }))} />
    </div>
  );
}
