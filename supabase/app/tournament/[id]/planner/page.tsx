import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentPlannerEditor } from "@/components/tournament-planner-editor";
import { isoToLocalInput, type PlanItemRow } from "@/lib/tournament";

export default async function PlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/planner`);

  const { data: t } = await supabase.from("tournaments").select("id, title, starts_at").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { data: items } = await supabase
    .from("tournament_plan_items")
    .select("id, title, kind, starts_at, ends_at, notes, sort_order")
    .eq("tournament_id", id)
    .order("starts_at");

  // New items default to the event's start date (else today).
  const startLocal = t.starts_at ? isoToLocalInput(t.starts_at) : "";
  const defaultDate = startLocal ? startLocal.slice(0, 10) : new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Competition</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Day planner</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          Plan your event day end to end — when sponsors set up, food arrives, games start, the DJ kicks off, awards. This is your run-of-show, and it works with or without a draw. Courts are assigned per game over in Groups &amp; brackets.
        </p>
      </div>
      <TournamentPlannerEditor tournamentId={id} initial={(items as PlanItemRow[]) ?? []} defaultDate={defaultDate} />
    </div>
  );
}
