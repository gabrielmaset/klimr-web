"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { withdrawRegistration } from "@/app/tournaments/actions";

export function WithdrawEntryButton({ registrationId, waitlisted }: { registrationId: string; waitlisted?: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function go() {
    setBusy(true);
    setErr(null);
    withdrawRegistration(registrationId).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setErr(r.error ?? "Something went wrong.");
        setConfirming(false);
      } else {
        startTransition(() => router.refresh());
      }
    });
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="press inline-flex items-center gap-1 rounded-lg border border-rule bg-bg px-2.5 py-1.5 text-xs font-semibold text-mute hover:text-brand-deep">
        Withdraw
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={go} disabled={busy} className="press inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" /> : null} {waitlisted ? "Leave waitlist" : "Confirm"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy} aria-label="Cancel" className="inline-flex items-center justify-center rounded-lg border border-rule bg-bg px-2 py-1.5 text-mute hover:text-ink">
        <X size={13} />
      </button>
      {err ? <span className="text-[11px] font-medium text-brand-deep">{err}</span> : null}
    </span>
  );
}
