"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRound, Mail, Loader2, UserPlus, BellRing, Trash2, ExternalLink } from "lucide-react";
import { acceptWaitlistedRegistration, removeWaitlistedRegistration, removeEmailWaitlist, notifyWaitlist } from "@/app/tournament/[id]/registrations/actions";

export type WaitlistRegItem = { regId: string; name: string; type: string; division: string | null; playerCount: number };
export type WaitlistEmailItem = { id: string; name: string; email: string | null; status: string; notifiedAt: string | null };

export function WaitlistManager({ regItems, emailItems, tournamentId }: { regItems: WaitlistRegItem[]; emailItems: WaitlistEmailItem[]; tournamentId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(id);
    setMsg(null);
    fn().then((r) => {
      setBusyId(null);
      if (!r.ok) setMsg({ kind: "err", text: r.error ?? "Something went wrong." });
      else startTransition(() => router.refresh());
    });
  }
  function doNotify() {
    setNotifying(true);
    setMsg(null);
    notifyWaitlist(tournamentId).then((r) => {
      setNotifying(false);
      if (!r.ok) setMsg({ kind: "err", text: r.error ?? "Something went wrong." });
      else {
        setMsg({ kind: "ok", text: `Notified ${r.count ?? 0} ${r.count === 1 ? "person" : "people"} that a spot opened.` });
        startTransition(() => router.refresh());
      }
    });
  }

  const total = regItems.length + emailItems.length;
  if (!total) {
    return (
      <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-8 text-center text-sm text-mute">
        No one is on the waitlist yet. Once the event is full, the &ldquo;Join waitlist&rdquo; button on the public page adds people here.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Spots opened?</p>
          <p className="text-xs text-mute">Email everyone waiting that a spot is available. Only works once the event has room again.</p>
        </div>
        <button
          type="button"
          onClick={doNotify}
          disabled={notifying}
          className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
        >
          {notifying ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Notify waitlist
        </button>
      </div>

      {msg ? <p className={`rounded-xl px-3 py-2 text-xs font-medium ${msg.kind === "ok" ? "bg-tint-success text-success" : "bg-tint-brand text-brand-deep"}`}>{msg.text}</p> : null}

      {regItems.length ? (
        <div className="grid gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-faint">Klimr entries · priority ({regItems.length})</p>
          {regItems.map((i, idx) => (
            <div key={i.regId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-mute ring-1 ring-rule">{idx + 1}</span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tint-brand text-brand-deep">
                <UserRound size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{i.name}</p>
                <p className="text-[11px] text-faint">
                  {[i.type, i.division, `${i.playerCount} ${i.playerCount === 1 ? "player" : "players"}`].filter(Boolean).join(" · ")} · entry complete
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={busyId === i.regId}
                  onClick={() => run(i.regId, () => acceptWaitlistedRegistration(i.regId))}
                  className="press inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === i.regId ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Accept &amp; enroll
                </button>
                <button
                  type="button"
                  disabled={busyId === i.regId}
                  onClick={() => run(i.regId, () => removeWaitlistedRegistration(i.regId))}
                  aria-label="Remove from waitlist"
                  className="press inline-flex items-center justify-center rounded-lg border border-rule bg-bg px-2 py-1.5 text-mute hover:bg-surface hover:text-brand-deep disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {emailItems.length ? (
        <div className="grid gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-faint">Email only · notify when a spot opens ({emailItems.length})</p>
          {emailItems.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-mute">
                <Mail size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">
                  {i.name}
                  {i.email ? <span className="font-normal text-mute"> · {i.email}</span> : null}
                </p>
                <p className="text-[11px] text-faint">{i.status === "invited" && i.notifiedAt ? `Notified ${i.notifiedAt}` : "Waiting"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {i.email ? (
                  <a href={`mailto:${i.email}`} className="inline-flex items-center gap-1 rounded-lg border border-rule bg-bg px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface">
                    <ExternalLink size={13} /> Contact
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === i.id}
                  onClick={() => run(i.id, () => removeEmailWaitlist(i.id))}
                  aria-label="Remove from waitlist"
                  className="press inline-flex items-center justify-center rounded-lg border border-rule bg-bg px-2 py-1.5 text-mute hover:bg-surface hover:text-brand-deep disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
