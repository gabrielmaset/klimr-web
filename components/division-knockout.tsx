"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trophy, Trash2, Info } from "lucide-react";
import { generateKnockout, clearBracket } from "@/app/tournaments/actions";
import { MatchScoreRow } from "@/components/match-score-row";

type Match = { matchId: string; aName: string; bName: string; scoreA: number | null; scoreB: number | null; status: string; bye: boolean; byeName?: string; locked: boolean };

function roundLabel(i: number, total: number): string {
  const fromEnd = total - i;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  return `Round ${i + 1}`;
}

export function DivisionKnockout({
  tournamentId,
  divisionId,
  defaultAdvancers,
  rounds,
  poolsReady,
}: {
  tournamentId: string;
  divisionId: string;
  defaultAdvancers: number;
  rounds: Match[][];
  poolsReady: boolean;
}) {
  const router = useRouter();
  const [adv, setAdv] = useState(String(defaultAdvancers || 2));
  const [busy, setBusy] = useState<null | "gen" | "clear">(null);
  const [err, setErr] = useState<string | null>(null);
  const hasKnockout = rounds.length > 0;

  async function gen() {
    setBusy("gen");
    setErr(null);
    const res = await generateKnockout(tournamentId, divisionId, Number(adv) || 2);
    if (res.ok) router.refresh();
    else {
      setErr(res.error ?? "Failed.");
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    setErr(null);
    const res = await clearBracket(tournamentId, divisionId);
    if (res.ok) router.refresh();
    else {
      setErr(res.error ?? "Failed.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-rule bg-bg/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Knockout stage</h3>
          <p className="text-xs text-mute">{hasKnockout ? "Top finishers advanced from the pools." : "Build a bracket from the pool results."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-mute">
            Advance per pool
            <input type="number" min={1} max={8} value={adv} onChange={(e) => setAdv(e.target.value)} className="w-14 rounded-lg border border-rule bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand" />
          </label>
          <button type="button" onClick={gen} disabled={!!busy || !poolsReady} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
            {busy === "gen" ? <Loader2 size={15} className="animate-spin" /> : <Trophy size={15} />} {hasKnockout ? "Rebuild" : "Generate knockout"}
          </button>
          {hasKnockout ? (
            <button type="button" onClick={clear} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-3 py-2 text-sm font-semibold text-mute hover:text-ink disabled:opacity-50" aria-label="Clear knockout">
              {busy === "clear" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <Info size={13} /> Seeded by pool finish — winners are top seeds. Earned from results, not chosen.
      </p>

      {err ? <p className="mt-2 text-xs font-semibold text-brand-deep">{err}</p> : null}
      {!poolsReady ? <p className="mt-2 text-xs text-mute">Draw the pools first to enable the knockout.</p> : null}

      {hasKnockout ? (
        <div className="mt-3 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {rounds.map((round, r) => (
              <div key={r} className="w-64 shrink-0">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute">{roundLabel(r, rounds.length)}</p>
                <div className="grid gap-2">
                  {round.map((m) => (
                    <MatchScoreRow key={m.matchId} matchId={m.matchId} aName={m.aName} bName={m.bName} scoreA={m.scoreA} scoreB={m.scoreB} status={m.status} bye={m.bye} byeName={m.byeName} locked={m.locked} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
