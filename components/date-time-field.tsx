"use client";

import { useMemo } from "react";
import { X } from "lucide-react";

/* A date input paired with a time dropdown in 15-minute increments. The value is
 * a local datetime string ("YYYY-MM-DDTHH:mm") — the same shape isoToLocalInput
 * produces — so it drops into the existing wizard/settings state unchanged.
 * Native datetime-local exposes single-minute steppers that make the list
 * unwieldy; a 96-option dropdown keeps it tidy. */

function label12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const QUARTERS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const v = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    out.push({ value: v, label: label12h(v) });
  }
  return out;
})();

const inputBase =
  "rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";

export function DateTimeField({
  value,
  onChange,
  optional = false,
  defaultTime = "09:00",
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  defaultTime?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [datePart, timePart] = useMemo(() => {
    if (!value) return ["", ""] as const;
    const [d, t = ""] = value.split("T");
    return [d, t.slice(0, 5)] as const;
  }, [value]);

  // Keep an off-grid legacy time (e.g. 09:07) selectable so it still displays.
  const options = useMemo(() => {
    if (timePart && !QUARTERS.some((q) => q.value === timePart)) {
      return [{ value: timePart, label: label12h(timePart) }, ...QUARTERS];
    }
    return QUARTERS;
  }, [timePart]);

  const setDate = (d: string) => onChange(d ? `${d}T${timePart || defaultTime}` : "");
  const setTime = (t: string) => {
    if (!datePart) return;
    onChange(`${datePart}T${t}`);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="date"
        aria-label={ariaLabel ? `${ariaLabel} date` : undefined}
        className={`${inputBase} flex-1`}
        value={datePart}
        onChange={(e) => setDate(e.target.value)}
      />
      <select
        aria-label={ariaLabel ? `${ariaLabel} time` : undefined}
        className={`${inputBase} w-32 shrink-0 disabled:opacity-50`}
        value={timePart || defaultTime}
        onChange={(e) => setTime(e.target.value)}
        disabled={!datePart}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {optional && value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rule bg-surface text-mute hover:text-ink"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}
