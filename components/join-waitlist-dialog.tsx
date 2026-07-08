"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Check, Loader2, Mail, UserRound, Trophy, ArrowRight } from "lucide-react";
import { joinWaitlistEmail } from "@/app/e/[code]/waitlist-actions";

export function JoinWaitlistDialog({
  tournamentId,
  code,
  loggedIn,
  triggerClassName,
}: {
  tournamentId: string;
  code: string;
  loggedIn: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accountHref = loggedIn ? `/e/${code}/signup` : `/login?next=${encodeURIComponent(`/e/${code}/signup`)}`;

  async function doEmail() {
    setBusy(true);
    setErr(null);
    const r = await joinWaitlistEmail(tournamentId, email, name);
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr(r.error ?? "Something went wrong.");
  }
  function close() {
    setOpen(false);
    setTimeout(() => {
      setDone(false);
      setErr(null);
      setBusy(false);
    }, 200);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        Join waitlist
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Join the waitlist"
        >
          <div className="fade w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-gradient-to-br from-brand to-brand-deep px-5 py-5 text-white">
              <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
                <X size={16} />
              </button>
              <div className="flex items-center gap-2">
                <Trophy size={18} />
                <h2 className="text-lg font-bold tracking-tight">Join the waitlist</h2>
              </div>
              <p className="mt-1 text-sm text-white/85">This event is full — get in line and we&rsquo;ll let you know if a spot opens.</p>
            </div>

            <div className="p-5">
              {done ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-tint-success text-success">
                    <Check size={24} />
                  </span>
                  <p className="text-base font-bold text-ink">You&rsquo;re on the waitlist</p>
                  <p className="text-sm text-mute">We&rsquo;ll email you if a spot opens. Spots are first-come, so sign up quickly when you hear from us.</p>
                  <button type="button" onClick={close} className="press mt-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft">
                    Done
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <Link href={accountHref} className="press flex items-center gap-3 rounded-2xl border border-brand/30 bg-tint-brand/50 p-3.5 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white">
                      <UserRound size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-ink">{loggedIn ? "Join with your Klimr account" : "Sign in for priority"}</span>
                      <span className="block text-xs text-mute">Fill out your entry now and get priority — you&rsquo;ll just submit payment if a spot opens.</span>
                    </span>
                    <ArrowRight size={17} className="shrink-0 text-brand-deep" />
                  </Link>

                  <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
                    <span className="h-px flex-1 bg-rule" /> or <span className="h-px flex-1 bg-rule" />
                  </div>

                  <div className="rounded-2xl border border-rule p-3.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-mute">
                        <Mail size={15} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-ink">Just notify me by email</p>
                        <p className="text-xs text-mute">No account needed. You&rsquo;ll sign up yourself if a spot opens.</p>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name (optional)"
                      className="mb-2 w-full rounded-[10px] border border-rule-2 bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        className="min-w-0 flex-1 rounded-[10px] border border-rule-2 bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
                      />
                      <button
                        type="button"
                        onClick={doEmail}
                        disabled={busy || !email.trim()}
                        className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : "Notify me"}
                      </button>
                    </div>
                  </div>

                  {err ? <p className="text-xs font-medium text-brand-deep">{err}</p> : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
