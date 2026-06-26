"use client";

import type { CustomFieldRow } from "@/lib/tournament";

export type AnswerMap = Record<string, string | string[]>;

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1 block text-sm font-semibold text-ink";

export function CustomFieldsRenderer({
  fields,
  answers,
  onChange,
}: {
  fields: CustomFieldRow[];
  answers: AnswerMap;
  onChange: (id: string, value: string | string[]) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-5">
      {fields.map((f) => {
        const val = answers[f.id];
        const sVal = typeof val === "string" ? val : "";
        const aVal = Array.isArray(val) ? val : [];
        return (
          <div key={f.id}>
            <label className={labelCls}>
              {f.label}
              {f.required ? <span className="text-brand"> *</span> : null}
            </label>
            {f.description ? <p className="-mt-0.5 mb-1.5 text-xs text-mute">{f.description}</p> : null}

            {f.field_type === "short_text" ? <input className={inputCls} value={sVal} onChange={(e) => onChange(f.id, e.target.value)} maxLength={200} /> : null}
            {f.field_type === "long_text" ? <textarea className={`${inputCls} min-h-24 resize-y`} value={sVal} onChange={(e) => onChange(f.id, e.target.value)} /> : null}
            {f.field_type === "number" ? <input type="number" className={inputCls} value={sVal} onChange={(e) => onChange(f.id, e.target.value)} /> : null}
            {f.field_type === "date" ? <input type="date" className={inputCls} value={sVal} onChange={(e) => onChange(f.id, e.target.value)} /> : null}
            {f.field_type === "single_select" ? (
              <select className={inputCls} value={sVal} onChange={(e) => onChange(f.id, e.target.value)}>
                <option value="">Select…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : null}
            {f.field_type === "multi_select" ? (
              <div className="grid gap-2">
                {f.options.map((o) => {
                  const checked = aVal.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => onChange(f.id, checked ? aVal.filter((x) => x !== o) : [...aVal, o])}
                      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${checked ? "border-brand bg-tint-brand text-ink" : "border-rule bg-bg text-ink-soft hover:border-faint"}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${checked ? "border-brand bg-brand text-white" : "border-faint"}`}>{checked ? "✓" : ""}</span>
                      {o}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
