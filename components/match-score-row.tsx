"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { recordMatchScore, clearMatchScore } from "@/app/tournaments/actions";

export function MatchScoreRow({
  matchId,
  aName,
  bName,
  scoreA,
  scoreB,
  status,
  bye = false,
  byeName,
  locked = false,
  court = null,
  time = null,
}: {
  matchId: string;
  aName: string;
  bName: string;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
  bye?: boolean;
  byeName?: string;
  locked?: boolean;
  court?: string | null;
  time?: string | null;
}) {
  const router = useRouter();
  const completed = status === "completed";
  const [editing, setEditing] = useState(!completed);
  const [a, setA] = useState(scoreA == null ? "" : String(scoreA));
  const [b, setB] = useState(scoreB == null ? "" : String(scoreB));
  const [busy, setBusy] = useState<null | "save" | "clear">(null);
  const [err, setErr] = useState<string | null>(null);

  const aWon = completed && scoreA != null && scoreB != null && scoreA > scoreB;
  const bWon = completed && scoreA != null && scoreB != null && scoreB > scoreA;
  const timeLabel = time ? new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  if (bye) {
    return (
      <div className="rounded-xl border border-rule bg-bg/40 px-3 py-2.5 text-sm">
        <span className="font-medium text-ink">{byeName}</span> <span className="text-mute">advances (bye)</span>
      </div>
    );
  }
  if (locked) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-rule bg-bg/40 px-3 py-2.5 text-sm text-mute">
        <span className="flex-1 truncate text-right">{aName}</span>
        <span className="text-faint">vs</span>
        <span className="flex-1 truncate">{bName}</span>
      </div>
    );
  }

  async function save() {
    if (a.trim() === "" || b.trim() === "") {
      setErr("Enter both scores.");
      return;
    }
    setBusy("save");
    setErr(null);
    const res = await recordMatchScore(matchId, Number(a), Number(b));
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setErr(res.error ?? "Failed.");
    }
    setBusy(null);
  }

  async function clear() {
    setBusy("clear");
    setErr(null);
    const res = await clearMatchScore(matchId);
    if (res.ok) {
      setA("");
      setB("");
      setEditing(true);
      router.refresh();
    } else {
      setErr(res.error ?? "Failed.");
    }
    setBusy(null);
  }

  return (
    <div className="rounded-xl border border-rule bg-bg/40 px-3 py-2.5">
      {court || timeLabel ? <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">{[court, timeLabel].filter(Boolean).join(" · ")}</p> : null}
      <div className="flex items-center gap-2">
        <span className={`flex-1 truncate text-right text-sm ${aWon ? "font-bold text-ink" : "text-ink-soft"}`}>{aName}</span>
        {completed && !editing ? (
          <span className="shrink-0 font-mono text-sm font-bold text-ink">
            {scoreA}&ndash;{scoreB}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} className="w-11 rounded-lg border border-rule bg-surface px-1 py-1.5 text-center text-sm text-ink outline-none focus:border-brand" />
            <span className="text-faint">&ndash;</span>
            <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} className="w-11 rounded-lg border border-rule bg-surface px-1 py-1.5 text-center text-sm text-ink outline-none focus:border-brand" />
          </span>
        )}
        <span className={`flex-1 truncate text-sm ${bWon ? "font-bold text-ink" : "text-ink-soft"}`}>{bName}</span>

        {completed && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-mute hover:text-ink">
            Edit
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={save} disabled={!!busy} className="press inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50" aria-label="Save score">
              {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            </button>
            {completed ? (
              <button type="button" onClick={() => setEditing(false)} className="text-mute hover:text-ink" aria-label="Cancel">
                <X size={15} />
              </button>
            ) : null}
          </span>
        )}
      </div>
      {completed && !editing ? (
        <div className="mt-1 text-right">
          <button type="button" onClick={clear} disabled={!!busy} className="text-[11px] font-medium text-faint hover:text-mute disabled:opacity-50">
            {busy === "clear" ? "Clearing…" : "Clear result"}
          </button>
        </div>
      ) : null}
      {err ? <p className="mt-1 text-right text-xs font-semibold text-brand-deep">{err}</p> : null}
    </div>
  );
}
