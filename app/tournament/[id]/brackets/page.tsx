import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DivisionGroups } from "@/components/division-groups";
import { DivisionBracket } from "@/components/division-bracket";
import { DivisionKnockout } from "@/components/division-knockout";
import { AwardPointsButton } from "@/components/award-points-button";
import type { TournamentFormatConfig } from "@/lib/tournament";

type BracketMatch = { id: string; round: number; slot: number; entry_a: string | null; entry_b: string | null; score_a: number | null; score_b: number | null; status: string };

function buildRounds(matches: BracketMatch[], nm: (id: string | null) => string) {
  const maxRound = matches.reduce((mx, m) => Math.max(mx, m.round), 0);
  const rounds: {
    matchId: string;
    aName: string;
    bName: string;
    scoreA: number | null;
    scoreB: number | null;
    status: string;
    bye: boolean;
    byeName?: string;
    locked: boolean;
  }[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    rounds.push(
      matches
        .filter((m) => m.round === r)
        .sort((a, b) => a.slot - b.slot)
        .map((m) => {
          const missing = m.entry_a === null || m.entry_b === null;
          const bye = m.status === "completed" && missing;
          return {
            matchId: m.id,
            aName: nm(m.entry_a),
            bName: nm(m.entry_b),
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status,
            bye,
            byeName: bye ? (m.entry_a ? nm(m.entry_a) : nm(m.entry_b)) : undefined,
            locked: m.status !== "completed" && missing,
          };
        }),
    );
  }
  return rounds;
}

export default async function BracketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/brackets`);

  const { data: t } = await supabase.from("tournaments").select("id, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const formatType = fc.format_type ?? "pools_knockout";

  const { count: awardedCount } = await supabase.from("tournament_points").select("id", { count: "exact", head: true }).eq("tournament_id", id);

  const { data: divisions } = await supabase.from("tournament_divisions").select("id, name, sort_order").eq("tournament_id", id).order("sort_order");
  const divs = divisions ?? [];

  let body: React.ReactNode;

  if (divs.length === 0) {
    body = (
      <div className="rounded-3xl border border-rule bg-surface p-8 text-center">
        <p className="text-base font-bold text-ink">Add a division first</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-mute">Draws happen per division. Create at least one division, then come back to draw it.</p>
        <Link href={`/tournament/${id}/divisions`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
          Divisions &amp; fees <ArrowRight size={15} />
        </Link>
      </div>
    );
  } else {
    // names (shared)
    const { data: regs } = await supabase.from("tournament_registrations").select("id, division_id, team_id, registrant_id").eq("tournament_id", id).not("status", "in", "(withdrawn,declined)");
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

    // draws (shared)
    const { data: draws } = await supabase.from("tournament_draws").select("division_id, draw_number, drawn_at").eq("tournament_id", id).order("draw_number");
    const allDraws = draws ?? [];
    const drawsFor = (divId: string) =>
      allDraws
        .filter((dr) => dr.division_id === divId)
        .sort((a, b) => a.draw_number - b.draw_number)
        .map((dr) => ({ number: dr.draw_number, at: new Date(dr.drawn_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) }));

    // all matches (shared)
    const { data: matches } = await supabase
      .from("tournament_matches")
      .select("id, division_id, group_id, round, slot, entry_a, entry_b, score_a, score_b, status, sort_order")
      .eq("tournament_id", id);
    const allMatches = matches ?? [];

    if (formatType === "single_elim") {
      body = (
        <div className="grid gap-5">
          {divs.map((d) => {
            const dRegs = list.filter((r) => r.division_id === d.id);
            const dMatches = allMatches.filter((m) => m.division_id === d.id && m.group_id === null);
            return <DivisionBracket key={d.id} tournamentId={id} divisionId={d.id} name={d.name} participantCount={dRegs.length} draws={drawsFor(d.id)} rounds={buildRounds(dMatches, nm)} />;
          })}
        </div>
      );
    } else {
      const { data: groups } = await supabase.from("tournament_groups").select("id, division_id, name, sort_order").eq("tournament_id", id).order("sort_order");
      const { data: ge } = await supabase.from("tournament_group_entries").select("group_id, division_id, registration_id, seed").eq("tournament_id", id);
      const allGroups = groups ?? [];
      const allGe = ge ?? [];
      const defaultPools = formatType === "pools_knockout" ? fc.pool_count ?? 2 : 1;
      const isKnockout = formatType === "pools_knockout";

      body = (
        <div className="grid gap-5">
          {divs.map((d) => {
            const dRegs = list.filter((r) => r.division_id === d.id);
            const dGroups = allGroups.filter((g) => g.division_id === d.id);
            const pools = dGroups.map((g) => ({
              name: g.name,
              entries: allGe
                .filter((e) => e.group_id === g.id)
                .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
                .map((e) => ({ name: nm(e.registration_id), seed: e.seed })),
              matches: allMatches
                .filter((m) => m.group_id === g.id)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((m) => ({ a: nm(m.entry_a), b: nm(m.entry_b), scoreA: m.score_a, scoreB: m.score_b, status: m.status })),
            }));
            const knockoutMatches = allMatches.filter((m) => m.division_id === d.id && m.group_id === null);
            return (
              <div key={d.id} className="grid gap-3">
                <DivisionGroups tournamentId={id} divisionId={d.id} name={d.name} participantCount={dRegs.length} defaultPools={defaultPools} pools={pools} format={formatType} draws={drawsFor(d.id)} />
                {isKnockout ? <DivisionKnockout tournamentId={id} divisionId={d.id} defaultAdvancers={2} rounds={buildRounds(knockoutMatches, nm)} poolsReady={dGroups.length > 0} /> : null}
              </div>
            );
          })}
        </div>
      );
    }
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker text-brand-deep">Competition</p>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Groups &amp; brackets</h1>
          <p className="mt-2 max-w-2xl text-sm text-mute">
            {formatType === "single_elim"
              ? "Each division's bracket is drawn completely at random — no manual seeding — so it's fair and tamper-proof. Winners advance as you enter scores."
              : "Each division is drawn into balanced pools completely at random — no manual seeding. Pool matches are created automatically; the knockout is then seeded by pool finish."}
          </p>
        </div>
        {divs.length > 0 ? <AwardPointsButton tournamentId={id} awarded={awardedCount ?? 0} /> : null}
      </div>
      {body}
    </div>
  );
}
