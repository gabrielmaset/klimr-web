"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shuffle, Trash2, Dices, TriangleAlert, Eye, Lock, Printer, Plus, Minus } from "lucide-react";
import { clearGroups } from "@/app/tournaments/actions";
import { computePoolStandings, poolSizes, type GroupExtraMode } from "@/lib/tournament";
import { openPrintWindow, escapeHtml } from "@/lib/print";

type Match = { a: string; b: string; scoreA: number | null; scoreB: number | null; status: string; court: string | null };
type Pool = { name: string; entries: { name: string; seed: number | null }[]; matches: Match[] };
type Draw = { number: number; at: string };
type Slot = { label: string; seed: number | null; placeholder: boolean };
type Unit = "team" | "person";

/** Shape the brackets page passes per division into the board/panel. */
export type DivisionData = {
  id: string;
  name: string;
  participantCount: number;
  groups: number;
  per: number;
  extra: number;
  mode: GroupExtraMode;
  pools: Pool[];
  draws: Draw[];
  previewEntries: string[];
  resultsStarted: boolean;
};

function noun(unit: Unit, n: number) {
  return unit === "person" ? (n === 1 ? "player" : "players") : n === 1 ? "team" : "teams";
}

function PoolCard({ name, slots, matches, preview = false, unit = "team" }: { name: string; slots: Slot[]; matches?: Match[]; preview?: boolean; unit?: Unit }) {
  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface shadow-sm ${preview ? "border-dashed border-rule" : "border-rule"}`}>
      <div className="flex items-center justify-between gap-2 bg-gradient-to-br from-brand to-brand-deep px-3.5 py-2">
        <p className="truncate text-[13px] font-bold tracking-wide text-white">{name}</p>
        <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {slots.length} {noun(unit, slots.length)}
        </span>
      </div>
      <ol className="divide-y divide-rule/70">
        {slots.map((s, j) => (
          <li key={j} className="flex items-center gap-2 px-3.5 py-1.5">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                s.placeholder ? "bg-bg text-faint ring-1 ring-inset ring-rule" : "bg-tint-brand text-brand-deep"
              }`}
            >
              {s.seed ?? j + 1}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${s.placeholder ? "italic text-faint" : "text-ink"}`}>{s.label}</span>
          </li>
        ))}
        {slots.length === 0 ? <li className="px-3.5 py-2.5 text-xs text-mute">Empty</li> : null}
      </ol>
      {matches && matches.length ? (
        <div className="border-t border-rule bg-bg/40 px-3.5 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Matches</p>
          <ul className="grid gap-1">
            {matches.map((m, k) => (
              <li key={k} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-ink-soft">
                  {m.a} <span className="text-faint">vs</span> {m.b}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {m.court ? <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-mute">{m.court}</span> : null}
                  {m.status === "completed" ? (
                    <span className="font-mono text-[11px] font-semibold text-ink">
                      {m.scoreA}&ndash;{m.scoreB}
                    </span>
                  ) : (
                    <span className="text-[10px] text-faint">&mdash;</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One division's pool card. Group count / size are CONTROLLED by the parent
 * board (which coordinates the shared tournament cap across divisions); drawing
 * is routed through the board so it persists every division's structure first.
 */
export function DivisionGroups({
  tournamentId,
  divisionId,
  name,
  participantCount,
  format,
  unit,
  groups,
  per,
  extra,
  mode,
  onPerChange,
  onAddPool,
  onRemovePool,
  chooser,
  onChooseGrow,
  onChooseNewPool,
  onCancelChooser,
  onDraw,
  pools,
  draws,
  previewEntries,
  resultsStarted,
}: {
  tournamentId: string;
  divisionId: string;
  name: string;
  participantCount: number;
  format: string;
  unit: Unit;
  groups: number;
  per: number;
  extra: number;
  mode: GroupExtraMode;
  onPerChange: (n: number) => void;
  onAddPool: () => void;
  onRemovePool: () => void;
  chooser: number | null;
  onChooseGrow: () => void;
  onChooseNewPool: () => void;
  onCancelChooser: () => void;
  onDraw: () => Promise<void>;
  pools: Pool[];
  draws: Draw[];
  previewEntries: string[];
  resultsStarted: boolean;
}) {
  const router = useRouter();
  const isRR = format === "round_robin";
  const [busy, setBusy] = useState<null | "gen" | "clear">(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasPools = pools.length > 0;
  const locked = resultsStarted;

  const capacity = groups * per + extra;
  const sizes = useMemo(() => poolSizes(groups, per, extra, mode), [groups, per, extra, mode]);
  const poolN = sizes.length;
  const uneven = extra > 0;

  const firstAt = draws.length ? draws[0].at : null;
  const lastDraw = draws.length ? draws[draws.length - 1] : null;
  const redrawn = draws.length > 1;

  // Empty-state preview reflects THIS division's own structure, including any
  // uneven (remainder) pools — it deals exactly like the real draw.
  const previewPools = useMemo(() => {
    const sz = poolSizes(groups, per, extra, mode);
    const haveNames = previewEntries.length > 0;
    const label = unit === "person" ? "Player" : "Team";
    const buckets: Slot[][] = sz.map(() => []);
    if (haveNames) {
      const counts = new Array(sz.length).fill(0) as number[];
      previewEntries.forEach((nm) => {
        let best = 0;
        let bestScore = -Infinity;
        for (let p = 0; p < sz.length; p++) {
          const room = sz[p] - counts[p];
          const score = room > 0 ? 1_000_000 + room * 1000 - p : -counts[p] * 1000 - p;
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
        counts[best] += 1;
        buckets[best].push({ label: nm, seed: null, placeholder: false });
      });
    } else {
      let n = 1;
      sz.forEach((size, p) => {
        for (let k = 0; k < size; k++) buckets[p].push({ label: `${label} ${n++}`, seed: null, placeholder: true });
      });
    }
    return buckets;
  }, [previewEntries, groups, per, extra, mode, unit]);

  async function doDraw() {
    setBusy("gen");
    setErr(null);
    setConfirming(false);
    try {
      await onDraw();
    } catch {
      setErr("Couldn't draw the pools.");
    }
    setBusy(null);
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

  function printPools() {
    const tables = pools
      .map((p) => {
        const entries = p.entries.map((e) => ({ regId: e.name, name: e.name }));
        const ms = p.matches.map((m) => ({ status: m.status, entryA: m.a, entryB: m.b, scoreA: m.scoreA, scoreB: m.scoreB }));
        const rows = computePoolStandings(entries, ms);
        const trs = rows
          .map((r, i) => `<tr><td class="n"><span class="rank">${i + 1}</span></td><td>${escapeHtml(r.name)}</td><td class="n">${r.wins}</td><td class="n">${r.losses}</td><td class="n">${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`)
          .join("");
        return `<div class="pool"><h3>${escapeHtml(p.name)}</h3><table><thead><tr><th class="n">#</th><th>Team</th><th class="n">W</th><th class="n">L</th><th class="n">+/-</th></tr></thead><tbody>${trs}</tbody></table></div>`;
      })
      .join("");
    openPrintWindow(`${name} — pool standings`, `${participantCount} ${participantCount === 1 ? "entry" : "entries"} · ${pools.length} ${pools.length === 1 ? "pool" : "pools"}`, `<div class="div"><div class="pools">${tables}</div></div>`);
  }

  const inputCls = "w-16 rounded-lg border border-rule bg-bg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-50";
  const stepBtn = "grid h-8 w-8 place-items-center rounded-lg border border-rule bg-bg text-ink transition-colors hover:border-brand hover:text-brand-deep disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-ink";

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
            <div className="flex items-center gap-1.5 text-xs font-medium text-mute">
              Pools
              <div className="flex items-center gap-1">
                <button type="button" onClick={onRemovePool} disabled={locked || poolN <= 1} className={stepBtn} aria-label="Remove a pool">
                  <Minus size={15} />
                </button>
                <span className="w-7 text-center text-sm font-bold tabular text-ink">{poolN}</span>
                <button type="button" onClick={onAddPool} disabled={locked} className={stepBtn} aria-label="Add a pool">
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ) : null}
          <label className="flex items-center gap-1.5 text-xs font-medium text-mute">
            {isRR ? (unit === "person" ? "Players" : "Teams") : "Per pool"}
            <input
              type="number"
              min={1}
              max={64}
              value={String(per)}
              onChange={(e) => onPerChange(parseInt(e.target.value || "0", 10))}
              disabled={locked}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={() => (hasPools ? setConfirming(true) : doDraw())}
            disabled={!!busy || participantCount === 0 || locked}
            className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
          >
            {busy === "gen" ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />} {hasPools ? "Redraw" : isRR ? "Draw round-robin" : "Draw pools"}
          </button>
          {hasPools ? (
            <button type="button" onClick={printPools} className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-mute hover:text-ink" aria-label="Print pool standings">
              <Printer size={15} />
            </button>
          ) : null}
          {hasPools ? (
            <button
              type="button"
              onClick={clear}
              disabled={!!busy || locked}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-mute hover:text-ink disabled:opacity-50"
              aria-label="Clear pools"
            >
              {busy === "clear" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-xs font-medium text-ink-soft">
        Holds <span className="font-bold">{capacity}</span> {noun(unit, capacity)}
        {isRR
          ? " · single round robin"
          : uneven
            ? ` · ${poolN} pools · ${sizes.join(" · ")}`
            : ` · ${groups} ${groups === 1 ? "pool" : "pools"} × ${per}`}
        <span className="ml-1 font-normal text-faint">— this sets the division&rsquo;s registration cap.</span>
      </p>

      {chooser != null && !locked ? (
        <div className="mt-3 rounded-xl border border-brand/40 bg-tint-brand/60 p-3.5">
          <p className="text-sm font-semibold text-brand-deep">
            Only {chooser} {noun(unit, chooser)} free in the cap — add {chooser === 1 ? "it" : "them"} as:
          </p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={onChooseGrow} className="press rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-brand">
              <span className="block text-sm font-semibold text-ink">Grow a pool</span>
              <span className="mt-0.5 block text-[11px] text-mute">Pools become {poolSizes(groups, per, extra + chooser, "grow").join(" · ")}</span>
            </button>
            <button type="button" onClick={onChooseNewPool} className="press rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-brand">
              <span className="block text-sm font-semibold text-ink">New small pool</span>
              <span className="mt-0.5 block text-[11px] text-mute">Adds a pool of {chooser} → {poolSizes(groups, per, extra + chooser, "pool").join(" · ")}</span>
            </button>
          </div>
          <button type="button" onClick={onCancelChooser} className="mt-2 text-xs font-medium text-mute hover:text-ink">
            Cancel
          </button>
        </div>
      ) : null}

      {locked ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-bg px-3 py-2 text-[11px] font-medium text-ink-soft">
          <Lock size={13} className="text-mute" /> Results have been entered — these pools are locked and can&rsquo;t be redrawn or cleared.
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
          <Dices size={13} /> Positions are drawn at random — organizers can&rsquo;t place teams.
        </p>
      )}

      {redrawn && lastDraw ? (
        <p className="mt-2 rounded-lg bg-tint-brand px-3 py-2 text-xs font-medium text-brand-deep">
          Redrawn {lastDraw.at} — this is draw #{lastDraw.number}. The original draw{firstAt ? ` (${firstAt})` : ""} stays on record, and the redraw is shown to participants.
        </p>
      ) : null}

      {confirming && !locked ? (
        <div className="mt-3 rounded-xl border border-brand/40 bg-tint-brand/60 p-3.5">
          <p className="flex items-start gap-2 text-sm font-semibold text-brand-deep">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" /> Redraw these pools?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            This discards the current pools and their matches and draws again at random. The original draw stays on record, this redraw is logged with a timestamp, and it&rsquo;s disclosed to participants on the event page.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={doDraw} disabled={busy === "gen"} className="press inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
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
            <PoolCard key={i} name={p.name} slots={p.entries.map((e) => ({ label: e.name, seed: e.seed, placeholder: false }))} matches={p.matches} unit={unit} />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-brand/30 bg-tint-brand/40 px-3 py-2 text-xs font-medium text-brand-deep">
            <Eye size={14} className="shrink-0" />
            {previewEntries.length
              ? `Preview — your ${participantCount} ${participantCount === 1 ? "entry" : "entries"} split across ${poolN} ${poolN === 1 ? "pool" : "pools"}. Draw to lock the pools and create matches.`
              : `Preview — ${poolN} ${poolN === 1 ? "pool" : "pools"}${uneven ? ` (sizes ${sizes.join(" · ")})` : ` of ${per}`}, holds ${capacity} ${noun(unit, capacity)}. Real ${unit === "person" ? "names" : "team names"} from sign-up fill these slots; draw to lock the pools.`}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {previewPools.map((slots, i) => (
              <PoolCard key={i} name={isRR ? "Round robin" : `Pool ${String.fromCharCode(65 + i)}`} slots={slots} preview unit={unit} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
