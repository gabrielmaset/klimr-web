"use client";
import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";

const initial: OnboardingState = {};

const SPORT_EMOJI: Record<string, string> = {
  tennis: "🎾",
  pickleball: "🏓",
  padel: "🟡",
  racquetball: "🟦",
  golf: "⛳",
};

export function OnboardingForm({
  sports,
}: {
  sports: { key: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(completeOnboarding, initial);

  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className="kicker text-faint">Home ZIP</span>
        <input
          name="zip"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          required
          placeholder="90066"
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 font-mono text-lg tracking-[0.2em] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
        />
        <span className="mt-1.5 block text-xs text-mute">
          Your home board. Rankings start at the ZIP level.
        </span>
      </label>

      <fieldset>
        <legend className="kicker text-faint">Primary sport</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sports.map((s) => (
            <label key={s.key} className="cursor-pointer">
              <input
                type="radio"
                name="sport"
                value={s.key}
                required
                className="peer sr-only"
              />
              <span className="press flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-mute transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-pop peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                <span aria-hidden>{SPORT_EMOJI[s.key] ?? "•"}</span>
                {s.name}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-mute">
          You can add more sports later — each gets its own ranking.
        </p>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Finish setup"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-brand-deep">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
