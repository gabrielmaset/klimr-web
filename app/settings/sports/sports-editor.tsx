"use client";

import { sportFormats, hasRatingSystem } from "@/lib/sport-play-options";

// Mirrors sports.skill_system in the DB (the wizard reads it live; this
// editor is client-only, so the map keeps the two surfaces consistent).
const SKILL_SYSTEM: Record<string, string | null> = {
  tennis: "NTRP",
  pickleball: "DUPR",
  padel: "Level",
  racquetball: "USAR",
  beach_volleyball: null,
};

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { sportMeta } from "@/lib/sports";
import { saveSports, type EditState } from "../actions";

const SPORT_KEYS = ["tennis", "pickleball", "padel", "racquetball"];
const LEVELS = [
  { value: "new", label: "New to it" },
  { value: "casual", label: "Casual" },
  { value: "competitive", label: "Competitive" },
  { value: "advanced", label: "Advanced" },
];

export type SportState = { on: boolean; level: string; rating: string; format: string };
export type SportsInitial = { sports: Record<string, SportState>; primary: string };

const selCls = "rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink";

export function SportsEditor({ initial }: { initial: SportsInitial }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveSports, undefined);
  const [sports, setSports] = useState<Record<string, SportState>>(initial.sports);
  const [primary, setPrimary] = useState<string>(initial.primary);

  const set = (k: string, patch: Partial<SportState>) =>
    setSports((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  const selectedKeys = SPORT_KEYS.filter((k) => sports[k]?.on);
  const effPrimary = selectedKeys.includes(primary) ? primary : selectedKeys[0] ?? "";
  const picked = selectedKeys.map((k) => ({
    key: k,
    level: sports[k].level,
    primary: k === effPrimary,
    rating: sports[k].rating,
    format: sports[k].format,
  }));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="sports_json" value={JSON.stringify(picked)} />

      <div className="space-y-3">
        {SPORT_KEYS.map((k) => {
          const meta = sportMeta(k);
          const s = sports[k];
          const on = s?.on;
          return (
            <div key={k} className={`rounded-2xl border p-4 transition-colors ${on ? "border-brand/40 bg-tint-brand" : "border-rule bg-surface"}`}>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!on}
                  onChange={(e) => set(k, { on: e.target.checked })}
                  className="h-4 w-4 accent-brand"
                />
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-lg" aria-hidden>{meta.emoji}</span>
                <span className="flex-1 text-sm font-bold text-ink">{meta.name}</span>
                {on && k === effPrimary ? (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Default</span>
                ) : null}
              </label>

              {on ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                  <select value={s.level} onChange={(e) => set(k, { level: e.target.value })} className={selCls} aria-label="Skill level">
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                  <select value={s.format} onChange={(e) => set(k, { format: e.target.value })} className={selCls} aria-label="Format" disabled={sportFormats(k).length === 1}>
                    {sportFormats(k).map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                    {sportFormats(k).some((f) => f.value === s.format) ? null : <option value={s.format}>{s.format}</option>}
                  </select>
                  {hasRatingSystem(SKILL_SYSTEM[k]) ? (
                    <input
                      value={s.rating}
                      onChange={(e) => set(k, { rating: e.target.value })}
                      placeholder={`${SKILL_SYSTEM[k]} (e.g. 4.0)`}
                      inputMode="decimal"
                      className={`${selCls} w-36 placeholder:text-faint`}
                      aria-label={`${SKILL_SYSTEM[k]} rating`}
                    />
                  ) : null}
                  {k !== effPrimary ? (
                    <button type="button" onClick={() => setPrimary(k)} className="press ml-auto text-xs font-semibold text-brand-deep hover:underline">
                      Make default
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-faint">Your default sport is what opens first across Klimr. Ratings are optional — leave blank if you&rsquo;re not sure.</p>

      <div className="flex items-center gap-3 border-t border-rule pt-5">
        <button
          type="submit"
          disabled={pending || selectedKeys.length === 0}
          className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/settings" className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Cancel</Link>
        {state?.ok ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check size={15} /> Saved</span>
        ) : null}
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
        {selectedKeys.length === 0 ? <span className="text-xs text-faint">Pick at least one sport.</span> : null}
      </div>
    </form>
  );
}
