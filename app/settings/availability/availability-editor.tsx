"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Plus, X, CalendarDays } from "lucide-react";
import { saveAvailability, type EditState } from "../actions";

type Range = { day: string; start: string; end: string };

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];
const DAY_ORDER = new Map(DAYS.map((d, i) => [d.key, i]));

// 15-minute options from 5:00 AM to 11:45 PM.
const TIMES: { value: string; label: string }[] = [];
for (let h = 5; h <= 23; h++) {
  for (const m of [0, 15, 30, 45]) {
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const hr12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    TIMES.push({ value, label: `${hr12}:${String(m).padStart(2, "0")} ${ampm}` });
  }
}

const selCls = "rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink";

export function AvailabilityEditor({ initial }: { initial: Range[] }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveAvailability, undefined);
  const [ranges, setRanges] = useState<Range[]>(initial);

  const sorted = [...ranges].sort(
    (a, b) => (DAY_ORDER.get(a.day) ?? 0) - (DAY_ORDER.get(b.day) ?? 0) || a.start.localeCompare(b.start),
  );

  const update = (i: number, patch: Partial<Range>) =>
    setRanges((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRanges((rs) => rs.filter((_, idx) => idx !== i));
  const add = () => setRanges((rs) => [...rs, { day: "mon", start: "18:00", end: "21:00" }]);

  // We sort for display, but submit/edit against the live array; map sorted rows
  // back to their real index so edits target the right block.
  const indexOf = (r: Range) => ranges.findIndex((x) => x === r);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="availability_json" value={JSON.stringify(ranges)} />

      {/* presets */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setRanges(["mon", "tue", "wed", "thu", "fri"].map((d) => ({ day: d, start: "18:00", end: "21:00" })))} className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-bg">
          Weekday evenings
        </button>
        <button type="button" onClick={() => setRanges(["sat", "sun"].map((d) => ({ day: d, start: "09:00", end: "12:00" })))} className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-bg">
          Weekend mornings
        </button>
        <button type="button" onClick={() => setRanges([])} className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:bg-bg">
          Clear all
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule px-4 py-10 text-center">
          <CalendarDays size={22} className="mx-auto text-faint" />
          <p className="mx-auto mt-3 max-w-xs text-sm text-mute">No times yet. Add the blocks when you&rsquo;re usually free to play.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const i = indexOf(r);
            return (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-surface px-3 py-2.5">
                <select value={r.day} onChange={(e) => update(i, { day: e.target.value })} className={selCls} aria-label="Day">
                  {DAYS.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
                <select value={r.start} onChange={(e) => update(i, { start: e.target.value })} className={selCls} aria-label="Start time">
                  {TIMES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <span className="text-xs text-faint">to</span>
                <select value={r.end} onChange={(e) => update(i, { end: e.target.value })} className={selCls} aria-label="End time">
                  {TIMES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => remove(i)} aria-label="Remove time block" className="press ml-auto grid h-7 w-7 place-items-center rounded-full text-mute transition-colors hover:bg-bg hover:text-ink">
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" onClick={add} className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg">
        <Plus size={15} /> Add a time block
      </button>

      <div className="flex items-center gap-3 border-t border-rule pt-5">
        <button
          type="submit"
          disabled={pending}
          className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/settings" className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Cancel</Link>
        {state?.ok ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check size={15} /> Saved</span>
        ) : null}
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
      </div>
    </form>
  );
}
