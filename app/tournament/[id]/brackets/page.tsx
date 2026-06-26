import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRight, CalendarClock, Medal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DivisionsBoard } from "@/components/divisions-board";
import { DivisionBracket } from "@/components/division-bracket";
import { DivisionKnockout } from "@/components/division-knockout";
import { AwardPointsButton } from "@/components/award-points-button";
import { BracketsTabs } from "@/components/brackets-tabs";
import { ResultsPublisher } from "@/components/results-publisher";
import type { TournamentFormatConfig, GroupExtraMode } from "@/lib/tournament";
import { effectivePoolCount } from "@/lib/tournament";

type BracketMatch = { id: string; round: number; slot: number; entry_a: string | null; entry_b: string | null; score_a: number | null; score_b: number | null; status: string; court: string | null };

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
    court: string | null;
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
            court: m.court,
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

  const { data: t } = await supabase.from("tournaments").select("id, code, capacity, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const formatType = fc.format_type ?? "pools_knockout";
  const resultsBuiltAtText = fc.published_results?.builtAt
    ? new Date(fc.published_results.builtAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const { count: awardedCount } = await supabase.from("tournament_points").select("id", { count: "exact", head: true }).eq("tournament_id", id);

  // Ranking points unlock only once every match has a result (status = completed).
  const { count: totalMatches } = await supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  const { count: openMatches } = await supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_id", id).neq("status", "completed");
  const allResultsIn = (totalMatches ?? 0) > 0 && (openMatches ?? 0) === 0;

  const { data: divisions } = await supabase.from("tournament_divisions").select("id, name, sort_order, capacity, group_count, group_size, group_extra, group_extra_mode").eq("tournament_id", id).order("sort_order");
  const divs = divisions ?? [];

  let body: React.ReactNode;
  let scheduleReady = false;
  let hasContent = false;

  if (divs.length === 0) {
    body = (
      <div className="rounded-3xl border border-rule bg-surface p-8 text-center">
        <p className="text-base font-bold text-ink">Add a division first</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-mute">Draws happen per division. Create at least one division, then come back to draw it.</p>
        <Link href={`/tournament/${id}/settings#divisions`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
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
      .select("id, division_id, group_id, round, slot, entry_a, entry_b, score_a, score_b, status, court, sort_order")
      .eq("tournament_id", id);
    const allMatches = matches ?? [];
    hasContent = allMatches.length > 0;

    if (formatType === "single_elim") {
      scheduleReady =
        list.length > 0 &&
        allMatches.length > 0 &&
        divs.every((d) => {
          const dRegs = list.filter((r) => r.division_id === d.id);
          if (dRegs.length === 0) return true;
          return allMatches.some((m) => m.division_id === d.id && m.group_id === null);
        });
      body = (
        <div className="grid gap-5">
          {divs.map((d) => {
            const dRegs = list.filter((r) => r.division_id === d.id);
            const dMatches = allMatches.filter((m) => m.division_id === d.id && m.group_id === null);
            return <DivisionBracket key={d.id} tournamentId={id} divisionId={d.id} name={d.name} participantCount={dRegs.length} capacity={t.capacity ?? null} draws={drawsFor(d.id)} rounds={buildRounds(dMatches, nm)} />;
          })}
        </div>
      );
    } else {
      const { data: groups } = await supabase.from("tournament_groups").select("id, division_id, name, sort_order").eq("tournament_id", id).order("sort_order");
      const { data: ge } = await supabase.from("tournament_group_entries").select("group_id, division_id, registration_id, seed").eq("tournament_id", id);
      const allGroups = groups ?? [];
      const allGe = ge ?? [];
      const defaultPools = formatType === "pools_knockout" ? fc.pool_count ?? 2 : 1;
      const defaultPerGroup = 4;
      const isKnockout = formatType === "pools_knockout";
      // Each division is sized independently from its own group structure
      // (groups × per-group) — no equal split of a shared total.
      const unit: "team" | "person" = fc.capacity_unit === "person" ? "person" : "team";

      scheduleReady =
        list.length > 0 &&
        allMatches.length > 0 &&
        divs.every((d) => {
          const dRegs = list.filter((r) => r.division_id === d.id);
          if (dRegs.length === 0) return true;
          const dGroups = allGroups.filter((g) => g.division_id === d.id);
          if (dGroups.length === 0) return false;
          return dGroups.every((g) => allGe.some((e) => e.group_id === g.id));
        });

      const perDiv = divs.map((d) => {
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
            .map((m) => ({ a: nm(m.entry_a), b: nm(m.entry_b), scoreA: m.score_a, scoreB: m.score_b, status: m.status, court: m.court })),
        }));
        const knockoutMatches = allMatches.filter((m) => m.division_id === d.id && m.group_id === null);
        const resultsStarted = allMatches.some((m) => m.division_id === d.id && m.status === "completed");
        const previewEntries = dRegs.map((r) => nameByReg.get(r.id) ?? "Team");
        const poolMatches = allMatches.filter((m) => m.division_id === d.id && m.group_id !== null);
        const poolsComplete = poolMatches.length > 0 && poolMatches.every((m) => m.status === "completed");
        const groupCount = d.group_count ?? defaultPools;
        const groupSize = d.group_size ?? defaultPerGroup;
        const groupExtra = Math.max(0, d.group_extra ?? 0);
        const groupMode: GroupExtraMode = d.group_extra_mode === "pool" ? "pool" : "grow";
        const poolN = effectivePoolCount(groupCount, groupExtra, groupMode);
        return { d, dRegs, pools, knockoutMatches, resultsStarted, previewEntries, poolsComplete, groupCount, groupSize, groupExtra, groupMode, poolN };
      });

      const boardDivisions = perDiv.map((x) => ({
        id: x.d.id,
        name: x.d.name,
        participantCount: x.dRegs.length,
        groups: x.groupCount,
        per: x.groupSize,
        extra: x.groupExtra,
        mode: x.groupMode,
        pools: x.pools,
        draws: drawsFor(x.d.id),
        previewEntries: x.previewEntries,
        resultsStarted: x.resultsStarted,
      }));

      const groupsNode = <DivisionsBoard tournamentId={id} max={t.capacity ?? null} unit={unit} format={formatType} divisions={boardDivisions} />;

      if (isKnockout) {
        const bracketsNode = (
          <div className="grid gap-5">
            {perDiv.map((x) => (
              <DivisionKnockout key={x.d.id} tournamentId={id} divisionId={x.d.id} name={x.d.name} defaultAdvancers={2} poolCount={x.poolN} rounds={buildRounds(x.knockoutMatches, nm)} poolsComplete={x.poolsComplete} />
            ))}
          </div>
        );
        body = <BracketsTabs groups={groupsNode} brackets={bracketsNode} />;
      } else {
        body = groupsNode;
      }
    }
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* header */}
      <div className="mb-6">
        <p className="kicker text-brand-deep">Competition</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Groups &amp; brackets</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          {formatType === "single_elim"
            ? "Each division's bracket is drawn completely at random — no manual seeding — so it's fair and tamper-proof. Winners advance as you enter scores."
            : "Each division is drawn into balanced pools completely at random — no manual seeding. Pool matches are created automatically; the knockout is then seeded by pool finish."}
        </p>
      </div>

      {/* next steps — what to do with the draw, in workflow order */}
      {divs.length > 0 ? (
        <div className="mb-6 grid gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* schedule */}
            <section className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${scheduleReady ? "bg-tint-success text-success" : "bg-bg text-mute"}`}>
                    <CalendarClock size={18} />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink">Schedule &amp; scores</h2>
                    <p className="max-w-md text-xs text-mute">Assign courts and start times for every match, then run scoring on the day.</p>
                  </div>
                </div>
                {scheduleReady ? (
                  <Link href={`/tournament/${id}/schedule`} className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-soft">
                    Send to schedule <ArrowRight size={15} />
                  </Link>
                ) : (
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <span aria-disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-faint">
                      Send to schedule <ArrowRight size={15} />
                    </span>
                    <p className="text-[11px] text-faint">Available once every pool is filled</p>
                  </div>
                )}
              </div>
            </section>

            {/* ranking points */}
            <section className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${allResultsIn ? "bg-tint-success text-success" : "bg-bg text-mute"}`}>
                    <Medal size={18} />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink">Ranking points</h2>
                    <p className="max-w-md text-xs text-mute">Turn the final results into ranking points for every player.</p>
                  </div>
                </div>
                <AwardPointsButton tournamentId={id} awarded={awardedCount ?? 0} ready={allResultsIn} />
              </div>
            </section>
          </div>

          {/* publish to public */}
          <ResultsPublisher
            tournamentId={id}
            publicCode={t.code ?? null}
            initialPublished={!!fc.results_published}
            initialAuto={!!fc.results_auto_publish}
            builtAtText={resultsBuiltAtText}
            canPublish={hasContent}
          />
        </div>
      ) : null}
      {body}
    </div>
  );
}
