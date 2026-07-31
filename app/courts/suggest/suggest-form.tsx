"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { FloatInput, FloatTextarea } from "@/components/float-field";
import { SPORTS } from "@/lib/sports";
import { createCourtSuggestion, type SuggestState } from "./actions";

export function SuggestCourtForm() {
  const [state, action, pending] = useActionState<SuggestState, FormData>(createCourtSuggestion, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-rule bg-surface p-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-tint-brand"><Check size={20} className="text-brand-deep" /></span>
        <h2 className="mt-3 font-display text-xl font-bold text-ink">Suggestion received</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-mute">
          A Klimr admin will verify it — once confirmed, the court appears in the finder for everyone nearby.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Link href="/courts" className="press rounded-[10px] bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2A2622]">Back to courts</Link>
          <Link href="/courts/suggest" className="text-sm font-semibold text-brand-deep hover:underline">Suggest another</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-rule bg-surface p-5 sm:p-6">
      <FloatInput label="Court name" id="sg-name" name="name" required maxLength={120} />
      <fieldset>
        <legend className="kicker text-faint">Which sports is it for?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SPORTS.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-rule-2 bg-white px-2.5 py-1.5 text-sm text-ink has-[:checked]:border-brand has-[:checked]:bg-tint-brand">
              <input type="checkbox" name="sports" value={s.key} className="h-3.5 w-3.5 accent-brand" /> {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <FloatInput label="Address" id="sg-address" name="address" required maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatInput label="Phone (optional)" id="sg-phone" name="phone" maxLength={30} />
        <FloatInput label="Website (optional)" id="sg-website_url" name="website_url" type="url" maxLength={300} />
      </div>
      <FloatInput label="Google Maps link (optional)" id="sg-maps_url" name="maps_url" type="url" maxLength={400} />
      <FloatTextarea label="Anything else (optional)" id="sg-notes" name="notes" rows={3} maxLength={500} />
      {state?.error ? <p className="text-sm font-semibold text-[#B42318]">{state.error}</p> : null}
      <button disabled={pending} className="press inline-flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2A2622] disabled:opacity-60">
        {pending ? <Loader2 size={15} className="animate-spin" /> : null} Send suggestion
      </button>
    </form>
  );
}
