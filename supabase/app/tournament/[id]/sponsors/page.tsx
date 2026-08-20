import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SponsorsEditor } from "@/components/sponsors-editor";
import type { TournamentFormatConfig, Sponsor } from "@/lib/tournament";

export default async function SponsorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/sponsors`);

  const { data: t } = await supabase.from("tournaments").select("id, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const sponsors: Sponsor[] = Array.isArray(fc.sponsors) ? fc.sponsors : [];

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Promotion</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Sponsors</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">Add the partners backing your event. They show up on your public page — and premium sponsors get a featured, ad-style spot.</p>
      </div>
      <SponsorsEditor tournamentId={t.id} initial={sponsors} />
    </div>
  );
}
