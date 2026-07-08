"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Loader2, Check, MapPin, Minus, Plus, Users } from "lucide-react";
import { updateTeam, resolveTeamZip } from "../actions";
import { teamSizeFor } from "@/lib/sports";

const field = "w-full rounded-xl border border-rule bg-surface shadow-e1 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function EditTeamForm({
  teamId,
  name,
  zip,
  city,
  state,
  sportKey,
  maxSize,
  memberCount,
}: {
  teamId: string;
  name: string;
  zip: string;
  city: string;
  state: string;
  sportKey: string;
  maxSize: number;
  memberCount: number;
}) {
  const sz = teamSizeFor(sportKey);
  const floor = Math.max(sz.min, memberCount);
  const [open, setOpen] = useState(false);
  const [zipVal, setZipVal] = useState(/^\d{5}$/.test(zip) ? zip : "");
  const [size, setSize] = useState(Math.min(Math.max(maxSize || sz.default, floor), sz.max));
  const [resolved, setResolved] = useState<{ city: string; state: string } | null>(city && state ? { city, state } : null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [resolving, startResolve] = useTransition();
  const [actionState, action, pending] = useActionState(updateTeam, undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (actionState?.ok) setOpen(false);
  }, [actionState?.ok]);

  function onZip(v: string) {
    const z = v.replace(/\D/g, "").slice(0, 5);
    setZipVal(z);
    setResolved(null);
    setZipError(null);
    if (z.length === 5) {
      startResolve(async () => {
        const r = await resolveTeamZip(z);
        if (r) setResolved(r);
        else setZipError("That doesn't match a US ZIP code.");
      });
    }
  }

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
    <form action={action} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="zip" value={zipVal} />
      <div className="space-y-3">
        <label className="block">
          <span className="kicker text-faint">Team name</span>
          <input name="name" required maxLength={60} defaultValue={name} className={`mt-1 ${field}`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
          <label className="block">
            <span className="kicker text-faint">ZIP code</span>
            <input
              value={zipVal}
              onChange={(e) => onZip(e.target.value)}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="90066"
              className={`mt-1 ${field} font-mono tracking-wider`}
            />
          </label>
          <div>
            <span className="kicker text-faint">City &amp; state</span>
            <div className="mt-1 flex h-[42px] items-center gap-2 rounded-xl border border-rule bg-bg px-3 text-sm">
              <MapPin size={15} className="shrink-0 text-faint" />
              {resolving ? (
                <span className="flex items-center gap-1.5 text-mute"><Loader2 size={14} className="animate-spin" /> Looking up…</span>
              ) : resolved ? (
                <span className="font-semibold text-ink">{resolved.city}, {resolved.state}</span>
              ) : (
                <span className="text-faint">Fills in from the ZIP</span>
              )}
            </div>
          </div>
        </div>
        {zipError ? <p className="text-sm text-brand-deep">{zipError}</p> : null}
        <div>
          <span className="kicker text-faint">Squad size</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-xl border border-rule bg-surface shadow-e1">
              <button type="button" onClick={() => setSize((n) => Math.max(n - 1, floor))} disabled={size <= floor} aria-label="Fewer players" className="press grid h-10 w-10 place-items-center text-ink transition-colors hover:bg-bg disabled:opacity-30">
                <Minus size={15} />
              </button>
              <span className="w-10 text-center font-display text-base text-ink tabular">{size}</span>
              <button type="button" onClick={() => setSize((n) => Math.min(n + 1, sz.max))} disabled={size >= sz.max} aria-label="More players" className="press grid h-10 w-10 place-items-center text-ink transition-colors hover:bg-bg disabled:opacity-30">
                <Plus size={15} />
              </button>
            </div>
            <p className="min-w-0 flex-1 text-xs text-mute">
              <Users size={12} className="mr-1 inline" />Max players on the roster ({sz.min}–{sz.max}).{memberCount > sz.min ? ` Can't go below your current ${memberCount}.` : ""}
            </p>
          </div>
        </div>
        <input type="hidden" name="max_size" value={size} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || zipVal.length !== 5}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? (<><Loader2 size={14} className="animate-spin" /> Saving…</>) : (<><Check size={14} /> Save</>)}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"
        >
          Cancel
        </button>
        {actionState?.error ? <span className="text-sm text-brand-deep">{actionState.error}</span> : null}
      </div>
    </form>
  );
}
