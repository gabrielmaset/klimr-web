"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, TriangleAlert, Save } from "lucide-react";
import { saveDivisionStructures, generateGroups } from "@/app/tournaments/actions";
import { DivisionGroups, type DivisionData } from "@/components/division-groups";

type Unit = "team" | "person";
type Setup = Record<string, { groups: number; per: number }>;

const cap = (s: { groups: number; per: number }) => s.groups * s.per;

// Trim divisions until the combined total fits `ceiling`. Reductions fall on the
// OTHER divisions first (largest capacity first, whole groups before per-group
// size); only if the edited/anchor division alone still busts the cap is it
// clamped too. Pure so it can seed initial state and run on every edit.
function rebalanceSetup(ids: string[], start: Setup, editedId: string, ceiling: number): Setup {
  const next: Setup = { ...start };
  const total = () => ids.reduce((a, id) => a + cap(next[id]), 0);
  const others = ids.filter((id) => id !== editedId);
  let guard = 4000;
  while (total() > ceiling && guard-- > 0) {
    const cand = others.filter((id) => next[id].groups > 1);
    if (!cand.length) break;
    cand.sort((a, b) => cap(next[b]) - cap(next[a]));
    next[cand[0]] = { ...next[cand[0]], groups: next[cand[0]].groups - 1 };
  }
  guard = 4000;
  while (total() > ceiling && guard-- > 0) {
    const cand = others.filter((id) => next[id].per > 1);
    if (!cand.length) break;
    cand.sort((a, b) => cap(next[b]) - cap(next[a]));
    next[cand[0]] = { ...next[cand[0]], per: next[cand[0]].per - 1 };
  }
  guard = 4000;
  while (total() > ceiling && guard-- > 0) {
    const e = next[editedId];
    if (e.groups > 1) next[editedId] = { ...e, groups: e.groups - 1 };
    else if (e.per > 1) next[editedId] = { ...e, per: e.per - 1 };
    else break;
  }
  return next;
}

function seedSetup(divisions: DivisionData[], max: number | null): Setup {
  const init: Setup = Object.fromEntries(divisions.map((d) => [d.id, { groups: d.groups, per: d.per }]));
  if (max == null) return init;
  const ids = divisions.map((d) => d.id);
  // Fit any pre-existing over-allocation: shrink the largest divisions first.
  const anchor = ids.slice().sort((a, b) => cap(init[a]) - cap(init[b]))[0] ?? ids[0];
  return ids.length ? rebalanceSetup(ids, init, anchor, max) : init;
}

/**
 * Coordinates every division's group structure against a single tournament-wide
 * capacity. Editing one division's group count or size live-rebalances the OTHER
 * divisions (trimming whole groups first, then per-group size, largest-first) so
 * the combined total can never exceed the cap. One save persists the cap and all
 * division structures together.
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
  const [maxStr, setMaxStr] = useState(max != null ? String(max) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ids = useMemo(() => divisions.map((d) => d.id), [divisions]);
  const maxNum = (() => {
    const n = parseInt(maxStr || "", 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const allocated = ids.reduce((a, id) => a + cap(setup[id] ?? { groups: 1, per: 1 }), 0);
  const remaining = maxNum != null ? maxNum - allocated : null;
  const overBy = remaining != null && remaining < 0 ? -remaining : 0;
  const noun = unit === "person" ? "players" : "teams";
  // The saved DB caps were over the cap (e.g. a leftover from before this rule):
  // we've fit them in the UI, but they only take effect once saved.
  const savedSum = divisions.reduce((a, d) => a + d.groups * d.per, 0);
  const savedOver = maxNum != null && savedSum > maxNum;

  function setField(id: string, field: "groups" | "per", raw: number) {
    const clamped = field === "groups" ? Math.max(1, Math.min(16, Math.floor(raw) || 1)) : Math.max(1, Math.min(64, Math.floor(raw) || 1));
    setSetup((prev) => {
      const merged: Setup = { ...prev, [id]: { ...prev[id], [field]: clamped } };
      return maxNum != null ? rebalanceSetup(ids, merged, id, maxNum) : merged;
    });
    setSaved(false);
    setErr(null);
  }

  function applyMax(raw: string) {
    setMaxStr(raw);
    setSaved(false);
    setErr(null);
    const n = parseInt(raw || "", 10);
    const ceiling = Number.isFinite(n) && n > 0 ? n : null;
    if (ceiling == null) return;
    setSetup((prev) => {
      const anchor = ids.slice().sort((a, b) => cap(prev[a]) - cap(prev[b]))[0] ?? ids[0];
      return ids.length ? rebalanceSetup(ids, prev, anchor, ceiling) : prev;
    });
  }

  async function persistAll(): Promise<boolean> {
    setSaving(true);
    setErr(null);
    const items = ids.map((id) => ({ divisionId: id, groups: isRR ? 1 : setup[id].groups, per: setup[id].per }));
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
    const res = await generateGroups(tournamentId, divisionId, isRR ? 1 : setup[divisionId].groups);
    if (!res.ok) throw new Error(res.error ?? "draw failed");
    startTransition(() => router.refresh());
  }

  const pct = maxNum ? Math.min(100, (allocated / maxNum) * 100) : 0;

  return (
    <div className="grid gap-4">
      <div className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-ink">Tournament capacity</h2>
            <p className="mt-0.5 text-xs text-mute">The most {noun} across every division combined — divisions draw from this shared cap.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-mute">
            Max {noun}
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={maxStr}
              onChange={(e) => applyMax(e.target.value)}
              placeholder="—"
              className="w-24 rounded-lg border border-rule bg-bg px-2.5 py-1.5 text-sm font-semibold text-ink outline-none focus:border-brand"
            />
          </label>
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
            <p className="mt-2 text-[11px] text-faint">Adjusting any division&rsquo;s groups or size automatically rebalances the others so the combined total stays within this cap.</p>
            {savedOver ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-tint-brand px-3 py-2 text-[11px] font-medium text-brand-deep">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" /> These divisions were over the {maxNum}-{unit === "person" ? "player" : "team"} cap and have been fit to {allocated}. Hit <span className="font-bold">Save structure</span> to apply the new caps.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-faint">Set a max to cap the combined size across divisions. Leave it blank to let each division stand on its own.</p>
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
          onGroupsChange={(n) => setField(d.id, "groups", n)}
          onPerChange={(n) => setField(d.id, "per", n)}
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
