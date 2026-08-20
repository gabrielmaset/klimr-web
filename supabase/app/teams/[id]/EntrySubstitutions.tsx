"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat, X } from "lucide-react";
import { cancelSubstitution, requestSubstitution } from "@/app/tournaments/substitution-actions";

/** Per-entry substitution controls on the team page (consent-first, 0162).
 *
 *  Sending a request never edits the roster — the incoming player must accept
 *  (answering the event's re-asked questions + waiver), and the deadline is
 *  re-checked inside that acceptance transaction. Undo, while the roster is
 *  unlocked, is simply the reverse request: the original player consents to
 *  come back. Multiple seats can have independent requests in flight; the
 *  database refuses two pending requests on one seat or one incoming player. */

type Person = { userId: string; name: string };
type PendingReq = { id: string; outUserId: string; inUserId: string; outName: string; inName: string };
type AcceptedReq = PendingReq;

export function EntrySubstitutions({
  tournamentId,
  regId,
  locked,
  lockAtIso,
  roster,
  eligible,
  pending,
  recentAccepted,
  canManage,
}: {
  tournamentId: string;
  regId: string;
  locked: boolean;
  lockAtIso: string | null;
  roster: (Person & { isReserve: boolean; confirmed: boolean })[];
  eligible: Person[];
  pending: PendingReq[];
  recentAccepted: AcceptedReq[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const pendingOutIds = useMemo(() => new Set(pending.map((p) => p.outUserId)), [pending]);
  const pendingInIds = useMemo(() => new Set(pending.map((p) => p.inUserId)), [pending]);
  const rosterIds = useMemo(() => new Set(roster.map((r) => r.userId)), [roster]);
  const eligibleIds = useMemo(() => new Set(eligible.map((e) => e.userId)), [eligible]);

  const outOptions = roster.filter((r) => !pendingOutIds.has(r.userId));
  const inOptions = eligible.filter((e) => !pendingInIds.has(e.userId));
  const lockLabel = lockAtIso
    ? new Date(lockAtIso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  function beginRequest(prefillOut?: string, prefillIn?: string) {
    setOutId(prefillOut ?? "");
    setInId(prefillIn ?? "");
    setNote("");
    setReview(false);
    setErr(null);
    setOpen(true);
  }

  function send() {
    if (!outId || !inId) {
      setErr("Pick who's out and who's in.");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await requestSubstitution(tournamentId, {
        registrationId: regId,
        removeUserId: outId,
        addUserId: inId,
        note,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't create the request.");
        setReview(false);
      }
    });
  }

  function cancel(id: string) {
    setErr(null);
    start(async () => {
      const res = await cancelSubstitution(id);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Couldn't cancel.");
    });
  }

  const outName = roster.find((r) => r.userId === outId)?.name ?? "";
  const inName = eligible.find((e) => e.userId === inId)?.name ?? "";

  return (
    <div className="mt-1.5">
      {pending.length ? (
        <div className="space-y-1">
          {pending.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <Repeat size={12} className="text-brand" />
              <span>
                <span className="font-semibold">{p.outName}</span> → <span className="font-semibold">{p.inName}</span> · waiting on {p.inName}
              </span>
              {canManage && !busy ? (
                <button type="button" onClick={() => cancel(p.id)} className="press inline-flex items-center gap-1 rounded-[9px] border border-rule px-2 py-0.5 font-semibold text-mute hover:text-ink">
                  <X size={11} /> Cancel
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {canManage && !locked && recentAccepted.length
        ? recentAccepted
            .filter((r) => rosterIds.has(r.inUserId) && eligibleIds.has(r.outUserId) && !pendingOutIds.has(r.inUserId) && !pendingInIds.has(r.outUserId))
            .slice(0, 2)
            .map((r) => (
              <div key={r.id} className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mute">
                <span>
                  Recent: <span className="font-semibold text-ink-soft">{r.inName}</span> replaced {r.outName}
                </span>
                <button
                  type="button"
                  onClick={() => beginRequest(r.inUserId, r.outUserId)}
                  className="press rounded-[9px] border border-rule px-2 py-0.5 font-semibold text-mute hover:text-ink"
                >
                  Undo
                </button>
              </div>
            ))
        : null}

      {canManage && !open ? (
        <button
          type="button"
          onClick={() => beginRequest()}
          disabled={locked}
          className="press mt-1.5 inline-flex items-center gap-1.5 rounded-[9px] border border-rule px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Repeat size={12} /> Substitute a player
        </button>
      ) : null}

      {open ? (
        <div className="mt-2 rounded-xl border border-rule bg-bg/40 p-3">
          {!review ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-mute">
                  Out
                  <select value={outId} onChange={(e) => setOutId(e.target.value)} className="mt-1 w-full rounded-[9px] border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink">
                    <option value="">Choose a rostered player…</option>
                    {outOptions.map((r) => (
                      <option key={r.userId} value={r.userId}>
                        {r.name}
                        {r.isReserve ? " (reserve)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-mute">
                  In
                  <select value={inId} onChange={(e) => setInId(e.target.value)} className="mt-1 w-full rounded-[9px] border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink">
                    <option value="">Choose a teammate…</option>
                    {inOptions.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {inOptions.length === 0 ? <p className="mt-1.5 text-xs text-mute">No eligible teammates — substitutes must be on the squad and not already entered in this event.</p> : null}
              <label className="mt-2 block text-xs font-semibold text-mute">
                Note for them (optional)
                <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} placeholder="Anything they should know" className="mt-1 w-full rounded-[9px] border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink" />
              </label>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (outId && inId ? (setErr(null), setReview(true)) : setErr("Pick who's out and who's in."))}
                  className="press rounded-[9px] bg-ink px-3 py-1.5 text-xs font-semibold text-surface"
                >
                  Review request
                </button>
                <button type="button" onClick={() => setOpen(false)} className="press rounded-[9px] border border-rule px-3 py-1.5 text-xs font-semibold text-mute">
                  Close
                </button>
                {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">
                {outName} → {inName}
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-ink-soft">
                <li>· Nothing changes until {inName} accepts — they&rsquo;ll answer the event&rsquo;s player questions and accept any waiver.</li>
                <li>· {lockLabel ? `The roster deadline (${lockLabel}) is checked again the moment they accept — last-minute acceptances past it are refused.` : "This event has no roster deadline configured."}</li>
                <li>· {outName} stays on the entry until the acceptance goes through, and gets notified if it does.</li>
              </ul>
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={send} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-[9px] bg-brand-deep px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null} Send request
                </button>
                <button type="button" onClick={() => setReview(false)} disabled={busy} className="press rounded-[9px] border border-rule px-3 py-1.5 text-xs font-semibold text-mute">
                  Back
                </button>
                {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
