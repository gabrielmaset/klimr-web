"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { Segmented } from "@/components/form-kit";
import { saveDivisions, updateTournamentDraft } from "@/app/tournaments/actions";
import { formatFee, type DivisionRow } from "@/lib/tournament";

type Row = { id?: string; name: string; description: string; fee: string; basis: "per_team" | "per_player"; capacity: string };

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";

function toRow(d: DivisionRow): Row {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? "",
    fee: d.fee_cents ? String(d.fee_cents / 100) : "",
    basis: d.fee_basis === "per_player" ? "per_player" : "per_team",
    capacity: d.capacity != null ? String(d.capacity) : "",
  };
}

const blank = (entryType: "team" | "individual"): Row => ({ name: "", description: "", fee: "", basis: entryType === "individual" ? "per_player" : "per_team", capacity: "" });

export function DivisionsEditor({
  tournamentId,
  entryType,
  initial,
  initialMode,
  initialUnit,
  totalCapacity,
}: {
  tournamentId: string;
  entryType: "team" | "individual";
  initial: DivisionRow[];
  initialMode: "pooled" | "per_division";
  initialUnit: "team" | "person";
  totalCapacity: number | null;
}) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial.map(toRow) : [blank(entryType)]);
  const [mode, setMode] = useState<"pooled" | "per_division">(initialMode);
  const [unit, setUnit] = useState<"team" | "person">(initialUnit);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, blank(entryType)]);
  const remove = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank(entryType)]));

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await updateTournamentDraft(tournamentId, { format_config: { capacity_mode: mode, capacity_unit: entryType === "individual" ? "person" : unit } });
      const payload = rows
        .filter((r) => r.name.trim() || r.fee.trim() || r.description.trim())
        .map((r, i) => ({
          id: r.id,
          name: r.name.trim() || "Division",
          description: r.description.trim() || null,
          fee_cents: Math.max(Math.round((parseFloat(r.fee) || 0) * 100), 0),
          fee_basis: entryType === "individual" ? "per_player" : r.basis,
          capacity: r.capacity.trim() === "" ? null : Math.max(parseInt(r.capacity, 10) || 0, 0),
          sort_order: i,
        }));
      const res = await saveDivisions(tournamentId, payload);
      if (res.ok) {
        setRows(res.divisions.length ? res.divisions.map(toRow) : [blank(entryType)]);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      } else {
        setErr(res.error ?? "Couldn't save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-bold text-ink">Capacity</h2>
        <p className="mt-0.5 text-xs text-mute">How registration limits work across your divisions.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Limit by</label>
            <Segmented
              ariaLabel="Capacity mode"
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: "pooled", label: "Shared total" },
                { value: "per_division", label: "Per division" },
              ]}
            />
            <p className="mt-1.5 text-xs text-faint">
              {mode === "pooled"
                ? `Divisions share one event total${totalCapacity != null ? ` of ${totalCapacity}` : ""} — set it in Settings. Sign-ups fill any division until the total is reached.`
                : "Each division has its own cap below, adjustable as entries come in."}
            </p>
          </div>
          {entryType === "team" ? (
            <div>
              <label className={labelCls}>Count by</label>
              <Segmented
                ariaLabel="Capacity unit"
                value={unit}
                onChange={(v) => setUnit(v)}
                options={[
                  { value: "team", label: "Teams" },
                  { value: "person", label: "Players" },
                ]}
              />
              <p className="mt-1.5 text-xs text-faint">{unit === "person" ? "Counts on-court players toward the cap." : "Counts entered teams toward the cap."}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="rounded-2xl border border-rule bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-3">
                <input className={inputCls} placeholder="Division name (e.g. Men's Open)" value={r.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={80} />
                <input className={inputCls} placeholder="Short description (optional)" value={r.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={140} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>Entry fee (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">$</span>
                      <input type="number" min={0} step="0.01" className={`${inputCls} pl-7`} placeholder="0" value={r.fee} onChange={(e) => update(i, { fee: e.target.value })} />
                    </div>
                  </div>
                  {entryType === "team" ? (
                    <div>
                      <label className={labelCls}>Charged</label>
                      <Segmented
                        ariaLabel="Fee basis"
                        value={r.basis}
                        onChange={(v) => update(i, { basis: v })}
                        options={[
                          { value: "per_team", label: "Per team" },
                          { value: "per_player", label: "Per player" },
                        ]}
                      />
                    </div>
                  ) : null}
                  {mode === "per_division" ? (
                    <div>
                      <label className={labelCls}>Capacity</label>
                      <input type="number" min={0} className={inputCls} placeholder="Unlimited" value={r.capacity} onChange={(e) => update(i, { capacity: e.target.value })} />
                    </div>
                  ) : (
                    <div className="flex items-end pb-2.5">
                      <p className="text-xs text-faint">Shares the event total.</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-mute">
                  {r.name.trim() || "This division"} · {formatFee(Math.max(Math.round((parseFloat(r.fee) || 0) * 100), 0), entryType === "individual" ? "per_player" : r.basis)}
                </p>
              </div>
              <button type="button" onClick={() => remove(i)} aria-label="Remove division" className="press grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rule text-mute hover:border-brand hover:text-brand-deep">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className="press mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-rule px-4 py-2.5 text-sm font-semibold text-mute hover:border-brand hover:text-brand-deep">
        <Plus size={16} /> Add division
      </button>

      <div className="mt-6 flex items-center gap-3 border-t border-rule pt-5">
        <button type="button" onClick={save} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save divisions
        </button>
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : savedAt ? <span className="text-xs text-faint">Saved {savedAt}</span> : null}
      </div>
    </div>
  );
}
