import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MatchScoreRow } from "@/components/match-score-row";
import { computePoolStandings, type TournamentFormatConfig } from "@/lib/tournament";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/schedule`);

  const { data: t } = await supabase.from("tournaments").select("id, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const isRR = (fc.format_type ?? "pools_knockout") === "round_robin";

  const { data: divisions } = await supabase.from("tournament_divisions").select("id, name, sort_order").eq("tournament_id", id).order("sort_order");
  const { data: groups } = await supabase.from("tournament_groups").select("id, division_id, name, sort_order").eq("tournament_id", id).order("sort_order");
  const { data: ge } = await supabase.from("tournament_group_entries").select("group_id, registration_id, seed").eq("tournament_id", id);
  const { data: matches } = await supabase
    .from("tournament_matches")
    .select("id, division_id, group_id, entry_a, entry_b, score_a, score_b, status, sort_order")
    .eq("tournament_id", id)
    .order("sort_order");

  const divs = divisions ?? [];
  const allGroups = groups ?? [];
  const allGe = ge ?? [];
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

  const drawnDivs = divs.filter((d) => allGroups.some((g) => g.division_id === d.id));

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Competition</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Schedule &amp; scores</h1>
        <p className="mt-2 text-sm text-mute">Enter results as matches finish — pool standings update automatically.</p>
      </div>

      {drawnDivs.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface p-8 text-center">
          <p className="text-base font-bold text-ink">No matches yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-mute">Draw the pools for a division to create its match schedule, then come back here to enter scores.</p>
          <Link href={`/tournament/${id}/brackets`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
            Groups &amp; brackets <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="grid gap-8">
          {drawnDivs.map((d) => {
            const dGroups = allGroups.filter((g) => g.division_id === d.id);
            return (
              <section key={d.id}>
                <h2 className="mb-3 text-lg font-bold text-ink">{d.name}</h2>
                <div className="grid gap-4">
                  {dGroups.map((g) => {
                    const entries = allGe
                      .filter((e) => e.group_id === g.id)
                      .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
                      .map((e) => ({ regId: e.registration_id, name: nm(e.registration_id) }));
                    const poolMatches = allMatches.filter((m) => m.group_id === g.id);
                    const standings = computePoolStandings(
                      entries,
                      poolMatches.map((m) => ({ entryA: m.entry_a, entryB: m.entry_b, scoreA: m.score_a, scoreB: m.score_b, status: m.status })),
                    );
                    const anyPlayed = standings.some((s) => s.played > 0);
                    return (
                      <div key={g.id} className="overflow-hidden rounded-3xl border border-rule bg-surface p-5">
                        <p className="mb-3 text-sm font-bold text-ink">{isRR ? "Round-robin" : g.name}</p>

                        <div className="overflow-x-auto rounded-xl border border-rule">
                          <table className="w-full min-w-[24rem] text-sm">
                            <thead className="bg-bg/60 text-left text-xs text-mute">
                              <tr>
                                <th className="px-3 py-2 font-semibold">#</th>
                                <th className="px-3 py-2 font-semibold">Team</th>
                                <th className="px-2 py-2 text-center font-semibold">P</th>
                                <th className="px-2 py-2 text-center font-semibold">W</th>
                                <th className="px-2 py-2 text-center font-semibold">L</th>
                                <th className="px-2 py-2 text-center font-semibold">+/&minus;</th>
                              </tr>
                            </thead>
                            <tbody>
                              {standings.map((s, i) => (
                                <tr key={s.regId} className="border-t border-rule">
                                  <td className="px-3 py-2 text-mute">{anyPlayed ? i + 1 : "—"}</td>
                                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                                  <td className="px-2 py-2 text-center text-ink-soft">{s.played}</td>
                                  <td className="px-2 py-2 text-center font-semibold text-ink">{s.wins}</td>
                                  <td className="px-2 py-2 text-center text-ink-soft">{s.losses}</td>
                                  <td className="px-2 py-2 text-center text-ink-soft">{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {poolMatches.length ? (
                          <div className="mt-4">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute">Matches</p>
                            <div className="grid gap-2">
                              {poolMatches.map((m) => (
                                <MatchScoreRow key={m.id} matchId={m.id} aName={nm(m.entry_a)} bName={nm(m.entry_b)} scoreA={m.score_a} scoreB={m.score_b} status={m.status} />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
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
