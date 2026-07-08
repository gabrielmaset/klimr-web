"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Swords, Send, ChevronDown } from "lucide-react";
import { proposeTeamMatch, respondChallenge, recordResult, cancelTeamMatch } from "./actions";

type Opponent = { id: string; name: string };

export function ChallengePanel({ homeTeamId, opponents }: { homeTeamId: string; opponents: Opponent[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [awayTeamId, setAwayTeamId] = useState("");
  const [when, setWhen] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (opponents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-rule bg-surface px-5 py-4 text-sm text-mute">
        No other Pro teams in this sport to challenge yet. Once more Pro teams join, you&rsquo;ll be able to schedule matches here.
      </div>
    );
  }

  function submit() {
    setErr(null);
    if (!awayTeamId) {
      setErr("Pick a team to challenge.");
      return;
    }
    start(async () => {
      const r = await proposeTeamMatch({ homeTeamId, awayTeamId, scheduledAt: when || null, location, note });
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setAwayTeamId("");
      setWhen("");
      setLocation("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  const field = "w-full rounded-xl border border-rule bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand";

  return (
    <div className="rounded-2xl border border-rule bg-surface shadow-e1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
          <Swords size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">Challenge a team</span>
          <span className="block text-xs text-mute">Propose a match against another Pro team</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-rule p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Opponent</label>
            <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} className={field}>
              <option value="">Select a team…</option>
              {opponents.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Date &amp; time <span className="font-normal text-faint">(optional)</span></label>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Location <span className="font-normal text-faint">(optional)</span></label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Court or venue" className={field} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Note <span className="font-normal text-faint">(optional)</span></label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Anything the other team should know" className={field} />
          </div>
          {err ? <p className="text-xs font-semibold text-[#dc2626]">{err}</p> : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send challenge
            </button>
            <button type="button" onClick={() => setOpen(false)} className="press rounded-full px-3 py-2 text-sm font-semibold text-mute hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ActionMatch = { id: string; status: string; homeTeamId: string; awayTeamId: string; homeName: string; awayName: string };

export function MatchActions({ match, teamId }: { match: ActionMatch; teamId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [pending, start] = useTransition();

  const isAway = teamId === match.awayTeamId;

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setScoring(false);
      router.refresh();
    });
  }

  const btn = "press inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60";
  const danger = "text-[#b91c1c] hover:bg-[#fef2f2]";

  return (
    <div className="mt-3 border-t border-rule pt-3">
      {match.status === "proposed" && isAway ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => respondChallenge(match.id, true))} className={`${btn} bg-brand text-white hover:bg-brand-deep`}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => respondChallenge(match.id, false))} className={`${btn} ${danger}`}>
            <X size={14} /> Decline
          </button>
        </div>
      ) : null}

      {match.status === "proposed" && !isAway ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-mute">Waiting for {match.awayName} to respond.</span>
          <button type="button" disabled={pending} onClick={() => run(() => cancelTeamMatch(match.id))} className={`${btn} ${danger}`}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Cancel
          </button>
        </div>
      ) : null}

      {match.status === "scheduled" ? (
        scoring ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-ink">
                <span className="mb-1 block">{match.homeName}</span>
                <input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} className="w-20 rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
              </label>
              <span className="pb-2 text-sm font-bold text-faint">–</span>
              <label className="text-xs font-semibold text-ink">
                <span className="mb-1 block">{match.awayName}</span>
                <input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} className="w-20 rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
              </label>
            </div>
            {err ? <p className="text-xs font-semibold text-[#dc2626]">{err}</p> : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => recordResult(match.id, Number(homeScore), Number(awayScore)))}
                className={`${btn} bg-ink text-surface hover:opacity-90`}
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save result
              </button>
              <button type="button" onClick={() => setScoring(false)} className={`${btn} text-mute hover:text-ink`}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setScoring(true)} className={`${btn} bg-brand text-white hover:bg-brand-deep`}>
              <Check size={14} /> Record result
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => cancelTeamMatch(match.id))} className={`${btn} ${danger}`}>
              <X size={14} /> Cancel
            </button>
          </div>
        )
      ) : null}

      {err && !scoring ? <p className="mt-2 text-xs font-semibold text-[#dc2626]">{err}</p> : null}
    </div>
  );
}
