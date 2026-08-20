"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, TriangleAlert, Save } from "lucide-react";
import { saveDivisionStructures, generateGroups } from "@/app/tournaments/actions";
import { DivisionGroups, type DivisionData } from "@/components/division-groups";
import type { GroupExtraMode } from "@/lib/tournament";

type Unit = "team" | "person";
type SetupItem = { groups: number; per: number; extra: number; mode: GroupExtraMode };
type Setup = Record<string, SetupItem>;

const EMPTY: SetupItem = { groups: 1, per: 1, extra: 0, mode: "grow" };
const cap = (s: SetupItem) => s.groups * s.per + s.extra;

// Trim divisions until the combined total fits `ceiling`. Reductions fall on the
// OTHER divisions first, shedding the softest capacity first: remainder teams,
// then whole pools, then per-pool size (largest division first at each step).
// Only if the edited/anchor division alone still busts the cap is it clamped too.
// Pure so it can seed initial state and run on every edit.
function rebalanceSetup(ids: string[], start: Setup, editedId: string, ceiling: number): Setup {
  const next: Setup = { ...start };
  const total = () => ids.reduce((a, id) => a + cap(next[id]), 0);
  const others = ids.filter((id) => id !== editedId);
  const shed = (pick: (id: string) => boolean, reduce: (s: SetupItem) => SetupItem) => {
    let guard = 8000;
    while (total() > ceiling && guard-- > 0) {
      const cand = others.filter(pick);
      if (!cand.length) break;
      cand.sort((a, b) => cap(next[b]) - cap(next[a]));
      next[cand[0]] = reduce(next[cand[0]]);
    }
  };
  shed((id) => next[id].extra > 0, (s) => ({ ...s, extra: s.extra - 1 }));
  shed((id) => next[id].groups > 1, (s) => ({ ...s, groups: s.groups - 1 }));
  shed((id) => next[id].per > 1, (s) => ({ ...s, per: s.per - 1 }));

  let guard = 8000;
  while (total() > ceiling && guard-- > 0) {
    const e = next[editedId];
    if (e.extra > 0) next[editedId] = { ...e, extra: e.extra - 1 };
    else if (e.groups > 1) next[editedId] = { ...e, groups: e.groups - 1 };
    else if (e.per > 1) next[editedId] = { ...e, per: e.per - 1 };
    else break;
  }
  return next;
}

function seedSetup(divisions: DivisionData[], max: number | null): Setup {
  const init: Setup = Object.fromEntries(divisions.map((d) => [d.id, { groups: d.groups, per: d.per, extra: d.extra, mode: d.mode }]));
  if (max == null) return init;
  const ids = divisions.map((d) => d.id);
  // Fit any pre-existing over-allocation: shrink the largest divisions first.
  const anchor = ids.slice().sort((a, b) => cap(init[a]) - cap(init[b]))[0] ?? ids[0];
  return ids.length ? rebalanceSetup(ids, init, anchor, max) : init;
}

/**
 * Coordinates every division's pool structure against a single tournament-wide
 * capacity. Editing one division live-rebalances the OTHER divisions so the
 * combined total can never exceed the cap. Adding a pool when only a partial
 * remainder is free offers the organizer a choice — grow an existing pool, or
 * add one smaller pool — so leftover slots can be used without overshooting or
 * shrinking other divisions. One save persists the cap and every structure.
 */
export function DivisionsBoard({
  tournamentId,
  max,
  unit,
  format,
  divisions,
}: {
  tournamentId: string;
  max: number | null;
  unit: Unit;
  format: string;
  divisions: DivisionData[];
}) {
  const router = useRouter();
  const isRR = format === "round_robin";
  const [, startTransition] = useTransition();
  const [setup, setSetup] = useState<Setup>(() => seedSetup(divisions, max));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chooser, setChooser] = useState<{ id: string; free: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const ids = useMemo(() => divisions.map((d) => d.id), [divisions]);
  // The shared cap is owned by Settings → Format & eligibility; this page only
  // reads it and sizes divisions against it. It updates here on the next load
  // whenever it's changed in Settings.
  const maxNum = max != null && Number.isFinite(max) && max > 0 ? max : null;

  const allocated = ids.reduce((a, id) => a + cap(setup[id] ?? EMPTY), 0);
  const remaining = maxNum != null ? maxNum - allocated : null;
  const overBy = remaining != null && remaining < 0 ? -remaining : 0;
  const noun = unit === "person" ? "players" : "teams";
  // The saved DB caps were over the cap (e.g. a leftover from before this rule):
  // we've fit them in the UI, but they only take effect once saved.
  const savedSum = divisions.reduce((a, d) => a + d.groups * d.per + d.extra, 0);
  const savedOver = maxNum != null && savedSum > maxNum;

  function setPer(id: string, raw: number) {
    const clamped = Math.max(1, Math.min(64, Math.floor(raw) || 1));
    setSetup((prev) => {
      const merged: Setup = { ...prev, [id]: { ...prev[id], per: clamped } };
      return maxNum != null ? rebalanceSetup(ids, merged, id, maxNum) : merged;
    });
    setSaved(false);
    setErr(null);
    setHint(null);
  }

  // Add a pool. A whole pool is added when one fits the free budget (or there's
  // no cap); when only a partial remainder is free, open the grow/new-pool
  // chooser; when the cap is full, surface a hint instead of stealing capacity.
  function addPool(id: string) {
    setSaved(false);
    setErr(null);
    setHint(null);
    const s = setup[id];
    const free = maxNum == null ? null : maxNum - allocated;
    if (free == null || free >= s.per) {
      setChooser(null);
      setSetup((prev) => {
        const merged: Setup = { ...prev, [id]: { ...prev[id], groups: Math.min(16, prev[id].groups + 1) } };
        return maxNum != null ? rebalanceSetup(ids, merged, id, maxNum) : merged;
      });
    } else if (free >= 1) {
      setChooser({ id, free });
    } else {
      setChooser(null);
      setHint(`The ${maxNum}-${unit === "person" ? "player" : "team"} cap is full — raise Max ${noun}, or remove a pool from another division to add one here.`);
    }
  }

  function removePool(id: string) {
    setSaved(false);
    setErr(null);
    setHint(null);
    setChooser(null);
    setSetup((prev) => {
      const s = prev[id];
      if (s.extra > 0) return { ...prev, [id]: { ...s, extra: 0 } };
      if (s.groups > 1) return { ...prev, [id]: { ...s, groups: s.groups - 1 } };
      return prev;
    });
  }

  function applyChooser(mode: GroupExtraMode) {
    if (!chooser) return;
    const { id, free } = chooser;
    setSetup((prev) => {
      const s = prev[id];
      const merged: Setup = { ...prev, [id]: { ...s, extra: Math.min(64, s.extra + free), mode } };
      return maxNum != null ? rebalanceSetup(ids, merged, id, maxNum) : merged;
    });
    setChooser(null);
    setSaved(false);
    setErr(null);
  }

  async function persistAll(): Promise<boolean> {
    setSaving(true);
    setErr(null);
    const items = ids.map((id) => ({
      divisionId: id,
      groups: isRR ? 1 : setup[id].groups,
      per: setup[id].per,
      extra: isRR ? 0 : setup[id].extra,
      mode: setup[id].mode,
    }));
    const res = await saveDivisionStructures(tournamentId, maxNum, items);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "Couldn't save.");
      return false;
    }
    setSaved(true);
    startTransition(() => router.refresh());
    window.setTimeout(() => setSaved(false), 2500);
    return true;
  }

  async function drawDivision(divisionId: string) {
    const ok = await persistAll();
    if (!ok) throw new Error("save failed");
    const res = await generateGroups(tournamentId, divisionId);
    if (!res.ok) throw new Error(res.error ?? "draw failed");
    startTransition(() => router.refresh());
  }

  const pct = maxNum ? Math.min(100, (allocated / maxNum) * 100) : 0;

  return (
    <div className="grid gap-4">
      <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-ink">Tournament capacity</h2>
            <p className="mt-0.5 text-xs text-mute">The most {noun} across every division combined — divisions draw from this shared cap.</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Max {noun}</p>
            <p className="font-display text-2xl leading-none text-ink">{maxNum != null ? maxNum : "—"}</p>
            <p className="mt-0.5 text-[10px] text-faint">set in Settings → Format</p>
          </div>
        </div>

        {maxNum != null ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-ink-soft">
                <span className="font-bold text-ink">{allocated}</span> of {maxNum} allocated
              </span>
              <span className={overBy ? "font-semibold text-brand-deep" : "text-mute"}>{overBy ? `${overBy} over cap` : `${remaining} free`}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-rule">
              <div className={`h-full rounded-full transition-all ${overBy ? "bg-brand-deep" : "bg-brand"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-faint">Adjusting any division&rsquo;s pools or size rebalances the others so the combined total stays within the cap. Change the cap itself in <span className="font-medium text-mute">Settings → Format &amp; eligibility</span>.</p>
            {savedOver ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-tint-brand px-3 py-2 text-[11px] font-medium text-brand-deep">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" /> These divisions were over the {maxNum}-{unit === "person" ? "player" : "team"} cap and have been fit to {allocated}. Hit <span className="font-bold">Save structure</span> to apply the new caps.
              </p>
            ) : null}
            {hint ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-bg px-3 py-2 text-[11px] font-medium text-ink-soft">
                <TriangleAlert size={13} className="mt-0.5 shrink-0 text-mute" /> {hint}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-faint">No shared cap is set — each division stands on its own. Add one under <span className="font-medium text-mute">Settings → Format &amp; eligibility</span> (Capacity → Shared total).</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={persistAll} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save structure
          </button>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <Check size={14} /> Saved
            </span>
          ) : null}
          {err ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep">
              <TriangleAlert size={13} /> {err}
            </span>
          ) : null}
        </div>
      </div>

      {divisions.map((d) => (
        <DivisionGroups
          key={d.id}
          tournamentId={tournamentId}
          divisionId={d.id}
          name={d.name}
          participantCount={d.participantCount}
          format={format}
          unit={unit}
          groups={setup[d.id]?.groups ?? d.groups}
          per={setup[d.id]?.per ?? d.per}
          extra={isRR ? 0 : setup[d.id]?.extra ?? d.extra}
          mode={setup[d.id]?.mode ?? d.mode}
          onPerChange={(n) => setPer(d.id, n)}
          onAddPool={() => addPool(d.id)}
          onRemovePool={() => removePool(d.id)}
          chooser={chooser?.id === d.id ? chooser.free : null}
          onChooseGrow={() => applyChooser("grow")}
          onChooseNewPool={() => applyChooser("pool")}
          onCancelChooser={() => setChooser(null)}
          onDraw={() => drawDivision(d.id)}
          pools={d.pools}
          draws={d.draws}
          previewEntries={d.previewEntries}
          resultsStarted={d.resultsStarted}
        />
      ))}
    </div>
  );
}
