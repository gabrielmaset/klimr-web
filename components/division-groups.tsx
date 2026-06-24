"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shuffle, Trash2, Dices, TriangleAlert, Eye, Lock, Printer } from "lucide-react";
import { generateGroups, clearGroups } from "@/app/tournaments/actions";
import { computePoolStandings } from "@/lib/tournament";
import { openPrintWindow, escapeHtml } from "@/lib/print";

type Match = { a: string; b: string; scoreA: number | null; scoreB: number | null; status: string; court: string | null };
type Pool = { name: string; entries: { name: string; seed: number | null }[]; matches: Match[] };
type Draw = { number: number; at: string };
type Slot = { label: string; seed: number | null; placeholder: boolean };

function PoolCard({ name, slots, matches, preview = false }: { name: string; slots: Slot[]; matches?: Match[]; preview?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface shadow-sm ${preview ? "border-dashed border-rule" : "border-rule"}`}>
      <div className="flex items-center justify-between gap-2 bg-gradient-to-br from-brand to-brand-deep px-3.5 py-2">
        <p className="truncate text-[13px] font-bold tracking-wide text-white">{name}</p>
        <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {slots.length} {slots.length === 1 ? "team" : "teams"}
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

export function DivisionGroups({
  tournamentId,
  divisionId,
  name,
  participantCount,
  defaultPools,
  pools,
  format,
  draws,
  previewEntries,
  capacity,
  resultsStarted,
}: {
  tournamentId: string;
  divisionId: string;
  name: string;
  participantCount: number;
  defaultPools: number;
  pools: Pool[];
  format: string;
  draws: Draw[];
  previewEntries: string[];
  capacity: number | null;
  resultsStarted: boolean;
}) {
  const router = useRouter();
  const isRR = format === "round_robin";
  const [count, setCount] = useState(String(pools.length || defaultPools || (isRR ? 1 : 2)));
  const [busy, setBusy] = useState<null | "gen" | "clear">(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasPools = pools.length > 0;
  const locked = resultsStarted;

  const firstAt = draws.length ? draws[0].at : null;
  const lastDraw = draws.length ? draws[draws.length - 1] : null;
  const redrawn = draws.length > 1;

  // Empty-state preview: split known entries (or generic Team N placeholders) across
  // the chosen number of pools, so organizers can see the group structure pre-draw.
  const previewPools = useMemo(() => {
    const groups = Math.max(1, Math.min(16, Number(count) || 1));
    const haveNames = previewEntries.length > 0;
    const total = haveNames ? previewEntries.length : Math.min(Math.max(capacity ?? groups * 4, groups), 64);
    const names = haveNames ? previewEntries : Array.from({ length: total }, (_, i) => `Team ${i + 1}`);
    const buckets: Slot[][] = Array.from({ length: groups }, () => []);
    names.forEach((nm, i) => buckets[i % groups].push({ label: nm, seed: null, placeholder: !haveNames }));
    return buckets;
  }, [count, previewEntries, capacity]);

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
              <input
                type="number"
                min={1}
                max={16}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={locked}
                className="w-16 rounded-lg border border-rule bg-bg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => (hasPools ? setConfirming(true) : gen())}
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
            <PoolCard key={i} name={p.name} slots={p.entries.map((e) => ({ label: e.name, seed: e.seed, placeholder: false }))} matches={p.matches} />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-brand/30 bg-tint-brand/40 px-3 py-2 text-xs font-medium text-brand-deep">
            <Eye size={14} className="shrink-0" />
            {previewEntries.length
              ? `Preview — your ${participantCount} ${participantCount === 1 ? "entry" : "entries"} split evenly. Draw to lock the pools and create matches.`
              : "Preview — the pool layout fills as teams register. Draw to lock the pools and create matches."}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {previewPools.map((slots, i) => (
              <PoolCard key={i} name={isRR ? "Round robin" : `Pool ${String.fromCharCode(65 + i)}`} slots={slots} preview />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
