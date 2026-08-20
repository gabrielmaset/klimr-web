"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { setMatchSchedule } from "@/app/tournaments/actions";
import { isoToLocalInput, localInputToIso } from "@/lib/tournament";

export function MatchPlanRow({
  matchId,
  context,
  aName,
  bName,
  scheduledAt,
  court,
}: {
  matchId: string;
  context: string;
  aName: string;
  bName: string;
  scheduledAt: string | null;
  court: string | null;
}) {
  const router = useRouter();
  const [dt, setDt] = useState(isoToLocalInput(scheduledAt));
  const [crt, setCrt] = useState(court ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const res = await setMatchSchedule(matchId, dt ? localInputToIso(dt) : null, crt.trim() || null);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } else {
      setErr(res.error ?? "Failed.");
    }
    setBusy(false);
  }

  return (
    <div className="grid items-center gap-2 rounded-xl border border-rule bg-bg/40 px-3.5 py-2.5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">{context}</p>
        <p className="truncate text-sm text-ink">
          {aName} <span className="text-faint">vs</span> {bName}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" value={dt} onChange={(e) => { setDt(e.target.value); setSaved(false); }} className="rounded-[10px] border border-rule-2 bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
        <input value={crt} onChange={(e) => { setCrt(e.target.value); setSaved(false); }} placeholder="Court" className="w-24 rounded-[10px] border border-rule-2 bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15" />
        <button type="button" onClick={save} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? "Saved" : "Save"}
        </button>
      </div>
      {err ? <p className="text-xs font-semibold text-brand-deep sm:col-span-2">{err}</p> : null}
    </div>
  );
}
