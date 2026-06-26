"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, Check, X, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Segmented } from "@/components/form-kit";
import { saveCustomFields } from "@/app/tournaments/actions";
import { FIELD_TYPE_LABEL, fieldTypeHasOptions, type CustomFieldRow } from "@/lib/tournament";
import type { CustomFieldType } from "@/lib/database.types";

type FieldRow = {
  uid: string;
  id?: string;
  label: string;
  description: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  scope: "per_team" | "per_player";
};

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";
const TYPES: CustomFieldType[] = ["short_text", "long_text", "single_select", "multi_select", "number", "date"];

// Stable client-side key per row so reordering (drag / arrows) never remounts
// an unsaved question's inputs.
let _seq = 0;
const newUid = () => `f${_seq++}`;

function toRow(f: CustomFieldRow): FieldRow {
  return {
    uid: newUid(),
    id: f.id,
    label: f.label,
    description: f.description ?? "",
    type: (TYPES.includes(f.field_type as CustomFieldType) ? f.field_type : "short_text") as CustomFieldType,
    options: Array.isArray(f.options) ? f.options : [],
    required: f.required,
    scope: f.scope === "per_team" ? "per_team" : "per_player",
  };
}

const blank = (entryType: "team" | "individual"): FieldRow => ({ uid: newUid(), label: "", description: "", type: "short_text", options: ["", ""], required: false, scope: entryType === "individual" ? "per_player" : "per_player" });

function MiniSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-rule"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export function CustomFieldsEditor({ tournamentId, entryType, initial }: { tournamentId: string; entryType: "team" | "individual"; initial: CustomFieldRow[] }) {
  const [rows, setRows] = useState<FieldRow[]>(() => initial.map(toRow));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<FieldRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, blank(entryType)]);
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length || from === to) return rs;
      const copy = [...rs];
      const [it] = copy.splice(from, 1);
      copy.splice(to, 0, it);
      return copy;
    });
  const setOption = (i: number, oi: number, val: string) => update(i, { options: rows[i].options.map((o, k) => (k === oi ? val : o)) });
  const addOption = (i: number) => update(i, { options: [...rows[i].options, ""] });
  const removeOption = (i: number, oi: number) => update(i, { options: rows[i].options.filter((_, k) => k !== oi) });

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload = rows
        .filter((r) => r.label.trim())
        .map((r, i) => ({
          id: r.id,
          label: r.label.trim(),
          description: r.description.trim() || null,
          field_type: r.type,
          options: fieldTypeHasOptions(r.type) ? r.options.map((o) => o.trim()).filter(Boolean) : [],
          required: r.required,
          scope: entryType === "individual" ? "per_player" : r.scope,
          sort_order: i,
        }));
      const res = await saveCustomFields(tournamentId, payload);
      if (res.ok) {
        setRows((res.fields as CustomFieldRow[]).map(toRow));
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
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-10 text-center">
          <p className="text-sm font-semibold text-ink">No questions yet</p>
          <p className="mt-1 text-xs text-mute">Add fields like t-shirt size, emergency contact, or dietary needs.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.length > 1 ? (
            <p className="-mb-0.5 flex items-center gap-1.5 text-xs text-faint">
              <GripVertical size={13} /> Drag the handle — or use the arrows — to reorder questions.
            </p>
          ) : null}
          {rows.map((r, i) => (
            <div
              key={r.uid}
              data-card
              onDragOver={(e) => {
                if (dragIndex !== null) {
                  e.preventDefault();
                  setOverIndex(i);
                }
              }}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`rounded-2xl border bg-surface p-4 transition-shadow ${dragIndex === i ? "opacity-50" : ""} ${
                overIndex === i && dragIndex !== null && dragIndex !== i ? "border-brand ring-2 ring-brand/30" : "border-rule"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Reorder rail: drag handle + arrow fallback */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      const card = (e.currentTarget as HTMLElement).closest("[data-card]");
                      if (card) e.dataTransfer.setDragImage(card as Element, 16, 16);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    className="press grid h-7 w-7 cursor-grab place-items-center rounded-lg text-faint hover:bg-bg hover:text-mute active:cursor-grabbing"
                  >
                    <GripVertical size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move question up"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    className="press grid h-6 w-6 place-items-center rounded-lg text-mute hover:bg-bg hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move question down"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, i + 1)}
                    className="press grid h-6 w-6 place-items-center rounded-lg text-mute hover:bg-bg hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>

                <div className="grid min-w-0 flex-1 gap-3">
                  <input className={inputCls} placeholder="Question (e.g. T-shirt size)" value={r.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={120} />
                  <input className={inputCls} placeholder="Help text (optional)" value={r.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={160} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Answer type</label>
                      <select className={inputCls} value={r.type} onChange={(e) => update(i, { type: e.target.value as CustomFieldType })}>
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {FIELD_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {entryType === "team" ? (
                      <div>
                        <label className={labelCls}>Asked</label>
                        <Segmented
                          ariaLabel="Question scope"
                          value={r.scope}
                          onChange={(v) => update(i, { scope: v })}
                          options={[
                            { value: "per_player", label: "Each player" },
                            { value: "per_team", label: "Once per team" },
                          ]}
                        />
                      </div>
                    ) : null}
                  </div>

                  {fieldTypeHasOptions(r.type) ? (
                    <div className="rounded-xl border border-rule bg-bg/40 p-3">
                      <label className={labelCls}>Choices</label>
                      <div className="grid gap-2">
                        {r.options.map((o, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input className={inputCls} placeholder={`Choice ${oi + 1}`} value={o} onChange={(e) => setOption(i, oi, e.target.value)} maxLength={80} />
                            <button type="button" onClick={() => removeOption(i, oi)} aria-label="Remove choice" className="press grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rule text-mute hover:border-brand hover:text-brand-deep">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => addOption(i)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
                        <Plus size={13} /> Add choice
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 pt-0.5">
                    <MiniSwitch checked={r.required} onChange={(v) => update(i, { required: v })} />
                    <span className="text-sm font-medium text-ink-soft">Required</span>
                  </div>
                </div>
                <button type="button" onClick={() => remove(i)} aria-label="Remove question" className="press grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rule text-mute hover:border-brand hover:text-brand-deep">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={add} className="press mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-rule px-4 py-2.5 text-sm font-semibold text-mute hover:border-brand hover:text-brand-deep">
        <Plus size={16} /> Add question
      </button>

      <div className="mt-6 flex items-center gap-3 border-t border-rule pt-5">
        <button type="button" onClick={save} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save form
        </button>
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : savedAt ? <span className="text-xs text-faint">Saved {savedAt}</span> : null}
      </div>
    </div>
  );
}
