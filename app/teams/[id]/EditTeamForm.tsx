"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Loader2, Check } from "lucide-react";
import { updateTeam } from "../actions";

const field = "w-full rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function EditTeamForm({
  teamId,
  name,
  city,
  neighborhood,
}: {
  teamId: string;
  name: string;
  city: string;
  neighborhood: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateTeam, undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state?.ok) setOpen(false);
  }, [state?.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg"
      >
        <Pencil size={14} /> Edit team
      </button>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-rule bg-surface p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="space-y-3">
        <label className="block">
          <span className="kicker text-faint">Team name</span>
          <input name="name" required maxLength={60} defaultValue={name} className={`mt-1 ${field}`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="kicker text-faint">City</span>
            <input name="city" defaultValue={city} placeholder="City" className={`mt-1 ${field}`} />
          </label>
          <label className="block">
            <span className="kicker text-faint">Neighborhood</span>
            <input name="neighborhood" defaultValue={neighborhood} placeholder="Neighborhood" className={`mt-1 ${field}`} />
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check size={14} /> Save
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"
        >
          Cancel
        </button>
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
      </div>
    </form>
  );
}
