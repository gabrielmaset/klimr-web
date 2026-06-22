import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MatchPlanRow } from "@/components/match-plan-row";

function roundLabel(round: number, maxRound: number): string {
  const fromEnd = maxRound - round + 1;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  return `Round ${round}`;
}

export default async function PlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/planner`);

  const { data: t } = await supabase.from("tournaments").select("id, title").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { data: divisions } = await supabase.from("tournament_divisions").select("id, name, sort_order").eq("tournament_id", id).order("sort_order");
  const { data: groups } = await supabase.from("tournament_groups").select("id, name").eq("tournament_id", id);
  const { data: matches } = await supabase
    .from("tournament_matches")
    .select("id, division_id, group_id, round, slot, entry_a, entry_b, scheduled_at, court, status, sort_order")
    .eq("tournament_id", id);

  const divs = divisions ?? [];
  const groupName = new Map<string, string>();
  for (const g of groups ?? []) groupName.set(g.id, g.name);
  const allMatches = matches ?? [];

  // names
  const { data: regs } = await supabase.from("tournament_registrations").select("id, team_id, registrant_id").eq("tournament_id", id).not("status", "in", "(withdrawn,declined)");
  const list = regs ?? [];
  const teamIds = [...new Set(list.filter((r) => r.team_id).map((r) => r.team_id as string))];
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    const { data } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const x of data ?? []) teamName.set(x.id, x.name);
  }
  const profIds = [...new Set(list.filter((r) => !r.team_id).map((r) => r.registrant_id))];
  const profName = new Map<string, string>();
  if (profIds.length) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", profIds);
    for (const x of data ?? []) profName.set(x.id, x.display_name ?? "Player");
  }
  const nameByReg = new Map(list.map((r) => [r.id, r.team_id ? teamName.get(r.team_id) ?? "Team" : profName.get(r.registrant_id) ?? "Player"]));
  const nm = (regId: string | null) => (regId ? nameByReg.get(regId) ?? "TBD" : "TBD");

  const divsWithMatches = divs.filter((d) => allMatches.some((m) => m.division_id === d.id));
  const scheduledCount = allMatches.filter((m) => m.scheduled_at).length;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Competition</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Day planner</h1>
        <p className="mt-2 text-sm text-mute">
          Give each match a time and court. {allMatches.length ? `${scheduledCount} of ${allMatches.length} scheduled.` : ""}
        </p>
      </div>

      {divsWithMatches.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface p-8 text-center">
          <p className="text-base font-bold text-ink">No matches to plan yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-mute">Draw the pools or bracket for a division to create matches, then schedule them here.</p>
          <Link href={`/tournament/${id}/brackets`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
            Groups &amp; brackets <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="grid gap-7">
          {divsWithMatches.map((d) => {
            const dMatches = allMatches.filter((m) => m.division_id === d.id);
            const maxRound = dMatches.filter((m) => m.group_id === null).reduce((mx, m) => Math.max(mx, m.round), 0);
            const ordered = [...dMatches].sort((a, b) => {
              const ak = a.group_id ? 0 : 1;
              const bk = b.group_id ? 0 : 1;
              if (ak !== bk) return ak - bk;
              if (ak === 0) return a.sort_order - b.sort_order;
              return a.round - b.round || a.slot - b.slot;
            });
            return (
              <section key={d.id}>
                <h2 className="mb-3 text-lg font-bold text-ink">{d.name}</h2>
                <div className="grid gap-2">
                  {ordered.map((m) => {
                    const context = m.group_id ? groupName.get(m.group_id) ?? "Pool" : roundLabel(m.round, maxRound);
                    return <MatchPlanRow key={m.id} matchId={m.id} context={context} aName={nm(m.entry_a)} bName={nm(m.entry_b)} scheduledAt={m.scheduled_at} court={m.court} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
