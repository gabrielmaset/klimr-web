"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shuffle, Trash2, Dices, TriangleAlert } from "lucide-react";
import { generateBracket, clearBracket } from "@/app/tournaments/actions";
import { MatchScoreRow } from "@/components/match-score-row";

type Match = { matchId: string; aName: string; bName: string; scoreA: number | null; scoreB: number | null; status: string; bye: boolean; byeName?: string; locked: boolean };
type Draw = { number: number; at: string };

function roundLabel(i: number, total: number): string {
  const fromEnd = total - i;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  return `Round ${i + 1}`;
}

export function DivisionBracket({
  tournamentId,
  divisionId,
  name,
  participantCount,
  draws,
  rounds,
}: {
  tournamentId: string;
  divisionId: string;
  name: string;
  participantCount: number;
  draws: Draw[];
  rounds: Match[][];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "gen" | "clear">(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasBracket = rounds.length > 0;
  const firstAt = draws.length ? draws[0].at : null;
  const lastDraw = draws.length ? draws[draws.length - 1] : null;
  const redrawn = draws.length > 1;

  async function gen() {
    setBusy("gen");
    setErr(null);
    setConfirming(false);
    const res = await generateBracket(tournamentId, divisionId);
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
    <section className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">{name}</h2>
          <p className="text-xs text-mute">
            {participantCount} {participantCount === 1 ? "entry" : "entries"} · single elimination{firstAt ? ` · drawn ${firstAt}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => (hasBracket ? setConfirming(true) : gen())} disabled={!!busy || participantCount < 2} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
            {busy === "gen" ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />} {hasBracket ? "Redraw" : "Draw bracket"}
          </button>
          {hasBracket ? (
            <button type="button" onClick={clear} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-mute hover:text-ink disabled:opacity-50" aria-label="Clear bracket">
              {busy === "clear" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <Dices size={13} /> The bracket is drawn at random — organizers can&rsquo;t place teams.
      </p>

      {redrawn && lastDraw ? (
        <p className="mt-2 rounded-lg bg-tint-brand px-3 py-2 text-xs font-medium text-brand-deep">
          Redrawn {lastDraw.at} — this is draw #{lastDraw.number}. The original draw{firstAt ? ` (${firstAt})` : ""} stays on record, and the redraw is shown to participants.
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 rounded-xl border border-brand/40 bg-tint-brand/60 p-3.5">
          <p className="flex items-start gap-2 text-sm font-semibold text-brand-deep">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" /> Redraw this bracket?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">This discards the current bracket and all its results and draws again at random. The original draw stays on record, this redraw is logged with a timestamp, and it&rsquo;s disclosed to participants.</p>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={gen} disabled={busy === "gen"} className="press inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
              {busy === "gen" ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />} Redraw anyway
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-xs font-medium text-mute hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {err ? <p className="mt-2 text-xs font-semibold text-brand-deep">{err}</p> : null}

      {hasBracket ? (
        <div className="mt-4 overflow-x-auto pb-2">
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
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-6 text-center text-sm text-mute">
          {participantCount < 2 ? "Need at least 2 entries to draw a bracket." : "Not drawn yet — draw the bracket to build the matchups."}
        </p>
      )}
    </section>
  );
}
