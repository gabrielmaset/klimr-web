"use client";

import { Check } from "lucide-react";

/** A switch. On = brand. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-rule bg-surface shadow-e1 p-4 text-left transition-colors hover:border-faint"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-mute">{description}</span> : null}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-rule"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

/** A compact segmented control for 2–3 short, mutually exclusive options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-rule bg-bg p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-xl px-3 py-2 text-center text-sm font-semibold transition-colors ${active ? "bg-surface text-ink shadow-sm" : "text-mute hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Radio cards with descriptions, for richer single-choice options. */
export function OptionCards<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-2xl border p-4 text-left transition-colors ${active ? "border-brand bg-tint-brand" : "border-rule bg-surface hover:border-faint"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink">{o.label}</span>
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${active ? "border-brand bg-brand" : "border-faint"}`}>
                {active ? <Check size={11} className="text-white" /> : null}
              </span>
            </span>
            {o.hint ? <span className="mt-1 block text-xs text-mute">{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
