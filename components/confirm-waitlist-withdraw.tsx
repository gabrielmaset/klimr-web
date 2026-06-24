"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { withdrawEmailWaitlist } from "@/app/waitlist/withdraw/actions";

export function ConfirmWaitlistWithdraw({ id, eventTitle }: { id: string; eventTitle: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    const r = await withdrawEmailWaitlist(id);
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr(r.error ?? "Something went wrong.");
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-tint-success text-success">
          <Check size={24} />
        </span>
        <p className="text-base font-bold text-ink">You&rsquo;ve left the waitlist</p>
        <p className="text-sm text-mute">You won&rsquo;t get any more emails about {eventTitle}. You can rejoin anytime from the event page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-mute">
        Remove yourself from the waitlist for <span className="font-semibold text-ink">{eventTitle}</span>? You&rsquo;ll stop getting notifications about open spots.
      </p>
      <button type="button" onClick={go} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
        {busy ? <Loader2 size={15} className="animate-spin" /> : null} Leave the waitlist
      </button>
      {err ? <p className="text-xs font-medium text-brand-deep">{err}</p> : null}
    </div>
  );
}
