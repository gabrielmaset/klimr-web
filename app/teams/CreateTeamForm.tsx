"use client";

import { useActionState, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { createTeam } from "./actions";
import { SPORTS } from "@/lib/sports";

const field = "w-full rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function CreateTeamForm({
  hasTeams,
  defaultCity,
  defaultNeighborhood,
}: {
  hasTeams: boolean;
  defaultCity: string;
  defaultNeighborhood: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createTeam, undefined);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
      >
        <Plus size={15} /> {hasTeams ? "Create another team" : "Create a team"}
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <Plus size={15} className="text-brand" /> Create a team
      </h2>
      <form action={action} className="mt-3 space-y-3">
        <input name="name" required maxLength={60} placeholder="Team name" className={field} />
        <fieldset className="space-y-2">
          <legend className="kicker text-faint">Team type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-rule bg-bg p-3 has-[:checked]:border-brand has-[:checked]:bg-tint-brand">
              <input type="radio" name="category" value="recreational" defaultChecked className="mt-0.5 accent-[#ff4e1b]" />
              <span>
                <span className="block text-sm font-semibold text-ink">Recreational</span>
                <span className="block text-xs leading-snug text-mute">For fun, still ranked. A simple team page.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-rule bg-bg p-3 has-[:checked]:border-brand has-[:checked]:bg-tint-brand">
              <input type="radio" name="category" value="pro" className="mt-0.5 accent-[#ff4e1b]" />
              <span>
                <span className="block text-sm font-semibold text-ink">Pro</span>
                <span className="block text-xs leading-snug text-mute">School, club, or competitive team. Full profile workspace.</span>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="sport_key" defaultValue="" required className={field}>
            <option value="" disabled>
              Sport…
            </option>
            {SPORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
          <input name="city" defaultValue={defaultCity} placeholder="City (optional)" className={field} />
        </div>
        <input name="neighborhood" defaultValue={defaultNeighborhood} placeholder="Neighborhood (optional)" className={field} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Creating…
              </>
            ) : (
              "Create team"
            )}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="press rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-ink"
          >
            Cancel
          </button>
          {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
        </div>
      </form>
    </section>
  );
}
