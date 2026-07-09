"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Loader2, Check, Info } from "lucide-react";
import { Segmented } from "@/components/form-kit";
import { saveDivisions } from "@/app/tournaments/actions";
import { formatFee, type DivisionRow } from "@/lib/tournament";

type Row = { id?: string; name: string; description: string; fee: string; basis: "per_team" | "per_player"; capacity: string };

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";

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
  capacityUnit = "team",
}: {
  tournamentId: string;
  entryType: "team" | "individual";
  initial: DivisionRow[];
  initialMode: "pooled" | "per_division";
  capacityUnit?: "team" | "person";
}) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial.map(toRow) : [blank(entryType)]);
  const mode = initialMode; // capacity mode now lives in Settings → Format & eligibility
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const unitLabel = entryType === "individual" ? "players" : capacityUnit === "person" ? "players" : "teams";

  const update = (i: number, patch: Partial<Row>) => {
    setSavedAt(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const add = () => {
    setSavedAt(null);
    setRows((rs) => [...rs, blank(entryType)]);
  };
  const remove = (i: number) => {
    setSavedAt(null);
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank(entryType)]));
  };

  async function save() {
    setSaving(true);
    setErr(null);
    try {
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
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setSavedAt(null), 3000);
      } else {
        setErr(res.error ?? "Couldn't save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-3 text-xs text-mute">
        <Info size={14} className="mt-0.5 shrink-0 text-faint" />
        <span>
          {mode === "pooled"
            ? "Capacity is one shared total across all divisions — change the mode and the limit in Settings → Format & eligibility."
            : "Each division has its own cap below. Switch to a shared total in Settings → Format & eligibility."}
        </span>
      </div>

      <div className="grid gap-3">
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
            <div className="flex items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-3">
                <input className={inputCls} placeholder="Division name (e.g. Men's Open)" value={r.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={80} />
                <input className={inputCls} placeholder="Short description (optional)" value={r.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={140} />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-rule-soft bg-bg p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Entry fee</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">$</span>
                        <input type="number" min={0} step="0.01" className={`${inputCls} pl-7`} placeholder="0" value={r.fee} onChange={(e) => update(i, { fee: e.target.value })} aria-label="Entry fee (USD)" />
                      </div>
                      {entryType === "team" ? (
                        <Segmented
                          ariaLabel="Fee basis"
                          value={r.basis}
                          onChange={(v) => update(i, { basis: v })}
                          options={[
                            { value: "per_team", label: "Per team" },
                            { value: "per_player", label: "Per player" },
                          ]}
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-mute">
                      {r.name.trim() || "This division"} · {formatFee(Math.max(Math.round((parseFloat(r.fee) || 0) * 100), 0), entryType === "individual" ? "per_player" : r.basis)}
                    </p>
                  </div>
                  {mode === "per_division" ? (
                    <div className="rounded-xl border border-rule-soft bg-bg p-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Division capacity</p>
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} className={`${inputCls} w-28`} placeholder="Unlimited" value={r.capacity} onChange={(e) => update(i, { capacity: e.target.value })} aria-label={`Division capacity in ${unitLabel}`} />
                        <span className="rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft">{unitLabel}</span>
                      </div>
                      <p className="mt-2 text-xs text-mute">Counted in {unitLabel} — the unit is set in Format &amp; eligibility.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-rule bg-bg/60 p-3">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">Division capacity</p>
                      <p className="text-xs text-faint">Shares the event total — set in Format &amp; eligibility.</p>
                    </div>
                  )}
                </div>
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
