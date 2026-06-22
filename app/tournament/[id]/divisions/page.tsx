import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DivisionsEditor } from "@/components/tournament-divisions-editor";
import type { DivisionRow } from "@/lib/tournament";

export default async function DivisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/divisions`);

  const { data: t } = await supabase.from("tournaments").select("id, title, entry_type").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { data: divs } = await supabase
    .from("tournament_divisions")
    .select("id, name, description, fee_cents, fee_basis, capacity, sort_order")
    .eq("tournament_id", id)
    .order("sort_order");
  const entryType = t.entry_type === "individual" ? "individual" : "team";

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Registration</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Divisions &amp; fees</h1>
        <p className="mt-2 text-sm text-mute">Set the categories players enter and what each costs. {entryType === "team" ? "Teams" : "Players"} pick a division when they sign up.</p>
      </div>
      <DivisionsEditor tournamentId={t.id} entryType={entryType} initial={(divs as DivisionRow[]) ?? []} />
    </div>
  );
}
