"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shuffle, Trash2, Dices, TriangleAlert } from "lucide-react";
import { generateGroups, clearGroups } from "@/app/tournaments/actions";

type Match = { a: string; b: string; scoreA: number | null; scoreB: number | null; status: string; court: string | null };
type Pool = { name: string; entries: { name: string; seed: number | null }[]; matches: Match[] };
type Draw = { number: number; at: string };

export function DivisionGroups({
  tournamentId,
  divisionId,
  name,
  participantCount,
  defaultPools,
  pools,
  format,
  draws,
}: {
  tournamentId: string;
  divisionId: string;
  name: string;
  participantCount: number;
  defaultPools: number;
  pools: Pool[];
  format: string;
  draws: Draw[];
}) {
  const router = useRouter();
  const isRR = format === "round_robin";
  const [count, setCount] = useState(String(pools.length || defaultPools || (isRR ? 1 : 2)));
  const [busy, setBusy] = useState<null | "gen" | "clear">(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasPools = pools.length > 0;

  const firstAt = draws.length ? draws[0].at : null;
  const lastDraw = draws.length ? draws[draws.length - 1] : null;
  const redrawn = draws.length > 1;

  async function gen() {
    setBusy("gen");
    setErr(null);
    setConfirming(false);
    const res = await generateGroups(tournamentId, divisionId, isRR ? 1 : Number(count) || 2);
    if (res.ok) router.refresh();
    else {
      setErr(res.error ?? "Failed.");
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    setErr(null);
    const res = await clearGroups(tournamentId, divisionId);
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
            {participantCount} {participantCount === 1 ? "entry" : "entries"}
            {hasPools ? ` · ${pools.length} ${pools.length === 1 ? "pool" : "pools"}` : ""}
            {firstAt ? ` · drawn ${firstAt}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isRR ? (
            <label className="flex items-center gap-1.5 text-xs font-medium text-mute">
              Pools
              <input type="number" min={1} max={16} value={count} onChange={(e) => setCount(e.target.value)} className="w-16 rounded-lg border border-rule bg-bg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand" />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => (hasPools ? setConfirming(true) : gen())}
            disabled={!!busy || participantCount === 0}
            className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
          >
            {busy === "gen" ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />} {hasPools ? "Redraw" : isRR ? "Draw round-robin" : "Draw pools"}
          </button>
          {hasPools ? (
            <button type="button" onClick={clear} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-mute hover:text-ink disabled:opacity-50" aria-label="Clear pools">
              {busy === "clear" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <Dices size={13} /> Positions are drawn at random — organizers can&rsquo;t place teams.
      </p>

      {redrawn && lastDraw ? (
        <p className="mt-2 rounded-lg bg-tint-brand px-3 py-2 text-xs font-medium text-brand-deep">
          Redrawn {lastDraw.at} — this is draw #{lastDraw.number}. The original draw{firstAt ? ` (${firstAt})` : ""} stays on record, and the redraw is shown to participants.
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 rounded-xl border border-brand/40 bg-tint-brand/60 p-3.5">
          <p className="flex items-start gap-2 text-sm font-semibold text-brand-deep">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" /> Redraw these pools?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            This discards the current pools and their matches and draws again at random. The original draw stays on record, this redraw is logged with a timestamp, and it&rsquo;s disclosed to participants on the event page.
          </p>
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

      {hasPools ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pools.map((p, i) => (
            <div key={i} className="rounded-2xl border border-rule bg-bg/40 p-4">
              <p className="mb-2 text-sm font-bold text-ink">{p.name}</p>
              <ol className="grid gap-1.5">
                {p.entries.map((e, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-ink-soft">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-surface text-[11px] font-bold text-mute">{e.seed ?? j + 1}</span>
                    <span className="truncate">{e.name}</span>
                  </li>
                ))}
                {p.entries.length === 0 ? <li className="text-xs text-mute">Empty</li> : null}
              </ol>
              {p.matches.length ? (
                <div className="mt-3 border-t border-rule pt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute">Matches</p>
                  <ul className="grid gap-1">
                    {p.matches.map((m, k) => (
                      <li key={k} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-ink-soft">
                          {m.a} <span className="text-faint">vs</span> {m.b}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {m.court ? <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-mute">{m.court}</span> : null}
                          {m.status === "completed" ? <span className="font-mono text-[11px] font-semibold text-ink">{m.scoreA}&ndash;{m.scoreB}</span> : <span className="text-[10px] text-faint">&mdash;</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : participantCount === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-6 text-center text-sm text-mute">No entries in this division yet.</p>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-6 text-center text-sm text-mute">Not drawn yet — draw {isRR ? "the round-robin" : "pools"} to build the groups and match schedule.</p>
      )}
    </section>
  );
}
