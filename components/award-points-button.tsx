"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Medal, Check } from "lucide-react";
import { awardTournamentPoints } from "@/app/tournaments/actions";

export function AwardPointsButton({ tournamentId, awarded, ready = true }: { tournamentId: string; awarded: number; ready?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await awardTournamentPoints(tournamentId);
    if (res.ok) {
      setMsg(`Awarded to ${res.awarded} player${res.awarded === 1 ? "" : "s"}.`);
      router.refresh();
    } else {
      setErr(res.error ?? "Failed.");
    }
    setBusy(false);
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-rule bg-bg px-3.5 py-2 text-sm font-semibold text-faint">
          <Medal size={15} /> Award ranking points
        </button>
        <p className="text-[11px] text-faint">Available once all results are in</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" onClick={run} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:border-brand disabled:opacity-50">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Medal size={15} className="text-brand-deep" />}
        {awarded > 0 ? "Re-award ranking points" : "Award ranking points"}
      </button>
      {msg ? (
        <p className="inline-flex items-center gap-1 text-xs font-semibold text-success">
          <Check size={13} /> {msg}
        </p>
      ) : err ? (
        <p className="text-xs font-semibold text-brand-deep">{err}</p>
      ) : awarded > 0 ? (
        <p className="text-[11px] text-faint">{awarded} entries in the points ledger</p>
      ) : (
        <p className="text-[11px] text-faint">Feeds the community rankings</p>
      )}
    </div>
  );
}
