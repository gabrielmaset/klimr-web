"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export type GearItem = { category: string; model: string; spec: string | null };
const CATS = [
  { value: "racquet", label: "Racquet" },
  { value: "paddle", label: "Paddle" },
  { value: "strings", label: "Strings" },
  { value: "shoes", label: "Shoes" },
  { value: "bag", label: "Bag" },
  { value: "other", label: "Other" },
];

/** Owner-curated gear list — serialized into a hidden field for the form action. */
export function GearEditor({ initial }: { initial: GearItem[] }) {
  const [rows, setRows] = useState<GearItem[]>(initial);
  const set = (i: number, patch: Partial<GearItem>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="grid gap-2">
      <input type="hidden" name="gear" value={JSON.stringify(rows)} />
      {rows.map((g, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select value={g.category} onChange={(e) => set(i, { category: e.target.value })} aria-label="Category" className="h-9 rounded-[10px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink outline-none">
            {CATS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input value={g.model} onChange={(e) => set(i, { model: e.target.value })} maxLength={60} placeholder="Model (e.g. Blade 98 v9)" aria-label="Model" className="h-9 min-w-[180px] flex-1 rounded-[10px] border border-rule-2 bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand" />
          <input value={g.spec ?? ""} onChange={(e) => set(i, { spec: e.target.value })} maxLength={40} placeholder="Spec (16×19 · 305 g)" aria-label="Spec" className="h-9 w-44 rounded-[10px] border border-rule-2 bg-surface px-3 font-mono text-xs text-ink outline-none placeholder:text-faint focus:border-brand" />
          <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label="Remove" className="press text-mute hover:text-danger"><X size={15} /></button>
        </div>
      ))}
      {rows.length < 8 ? (
        <button type="button" onClick={() => setRows((r) => [...r, { category: "racquet", model: "", spec: null }])} className="press inline-flex w-fit items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink">
          <Plus size={13} /> Add gear
        </button>
      ) : null}
    </div>
  );
}
