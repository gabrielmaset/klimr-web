"use client";

import { useState, useTransition } from "react";
import { Crown, Plus, MapPin, Check, Loader2, Trophy } from "lucide-react";
import type { QSessionState, QTeam } from "@/lib/queue";
import { formationLabel, levelLabel } from "@/lib/queue";
import { sportMeta } from "@/lib/sports";
import { useQueueState } from "@/components/queue/use-queue-state";
import { joinCourtGuest } from "@/app/queue/actions";

async function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

function PlayerChips({ team, muted }: { team: QTeam; muted?: boolean }) {
  if (!team.members.length) return <span className="text-sm text-faint">Open spot</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {team.members.map((m, i) => (
        <span key={i} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ring-1 ${muted ? "bg-white/70 text-mute ring-rule" : "bg-white text-ink ring-rule"}`}>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{(m.name.trim()[0] ?? "?").toUpperCase()}</span>
          {m.name}
        </span>
      ))}
    </div>
  );
}

export function GuestJoin({ initial }: { initial: QSessionState }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"" | "joined" | "pending">("");
  const [joiningCourt, setJoiningCourt] = useState<string | null>(null);

  const join = (courtId: string) => {
    setErr(null);
    if (name.trim().length < 2) {
      setErr("Enter your name first.");
      return;
    }
    setJoiningCourt(courtId);
    start(async () => {
      const coords = await getCoords();
      const f = new FormData();
      f.append("courtId", courtId);
      f.append("name", name.trim());
      if (coords) {
        f.append("lat", String(coords.lat));
        f.append("lng", String(coords.lng));
      }
      const res = await joinCourtGuest(f);
      if (res?.error) {
        setErr(res.error === "location_required" ? "Allow location access so we can confirm you're on-site, then tap Join again." : res.error);
      } else {
        setConfirm(res.pending ? "pending" : "joined");
        setTimeout(() => setConfirm(""), 5000);
      }
      setJoiningCourt(null);
      await refetch();
    });
  };

  const { session, courts } = state;
  const meta = sportMeta(session.sportKey);
  const open = session.status === "live";

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-xl px-4 py-7 sm:py-10">
        {/* header */}
        <div className="relative overflow-hidden rounded-[1.75rem] border border-rail-border bg-[linear-gradient(135deg,#1c1147,#0a0f1f)] px-6 py-7 text-center text-white">
          <span aria-hidden className="pointer-events-none absolute -right-5 -top-8 select-none text-[130px] leading-none opacity-[0.08]">{meta.emoji}</span>
          <span aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-brand/25 blur-3xl" />
          {open ? (
            <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              LIVE
            </span>
          ) : null}
          <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-3xl backdrop-blur">{meta.emoji}</div>
          <h1 className="relative mt-3 font-display text-2xl leading-tight sm:text-3xl">{session.title}</h1>
          <p className="relative mt-1 text-sm font-medium text-white/55">{meta.name} · walk-up sign-up</p>
        </div>

        {!open ? (
          <div className="mt-5 rounded-2xl border border-rule bg-surface p-8 text-center text-sm font-medium text-mute">{session.status === "ended" ? "This session has ended." : "The queue isn't open yet — check back when play starts."}</div>
        ) : !session.allowGuests ? (
          <div className="mt-5 rounded-2xl border border-rule bg-surface p-8 text-center text-sm font-medium text-mute">Walk-up sign-ups are turned off. Ask the organizer to add you.</div>
        ) : (
          <>
            {/* name */}
            <div className="mt-5 rounded-2xl border border-rule bg-surface p-4 shadow-[0_1px_0_rgba(10,10,11,0.02)]">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-mute">Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex R."
                maxLength={40}
                className="w-full rounded-xl border border-rule bg-bg px-4 py-3 text-base font-medium text-ink outline-none transition-colors focus:border-brand focus:bg-white"
              />
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
                <MapPin size={12} /> {session.requireLocation ? "Joining shares your location once to confirm you're on-site." : "Tap a court to join its next open team."}
              </p>
            </div>

            {confirm === "joined" ? (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-semibold text-success">
                <Check size={16} /> You&apos;re in! Find your name in the line below.
              </div>
            ) : confirm === "pending" ? (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#f5d08a] bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#b45309]">
                <Check size={16} /> Request sent — waiting for the organizer to approve you.
              </div>
            ) : null}
            {err ? <div className="mt-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium text-[#b91c1c]">{err}</div> : null}

            {/* courts */}
            <div className="mt-4 space-y-4">
              {courts.map((c) => {
                const busy = pending && joiningCourt === c.id;
                return (
                  <div key={c.id} className="overflow-hidden rounded-[1.5rem] border border-rule bg-surface">
                    <div className="flex items-center justify-between gap-2 px-5 pt-4">
                      <div className="min-w-0">
                        <h2 className="font-display text-xl leading-none text-ink">{c.label}</h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">{formationLabel(c.teamSize)}</span>
                          <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-mute ring-1 ring-rule">{c.levels.length ? c.levels.map(levelLabel).join(" · ") : "All levels"}</span>
                        </div>
                      </div>
                      <button type="button" disabled={pending} onClick={() => join(c.id)} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50">
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {session.requireApproval ? "Request" : "Join"}
                      </button>
                    </div>

                    {c.current ? (
                      <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl bg-tint-success px-3 py-2 text-xs font-semibold text-success">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                        </span>
                        Playing now · {c.current.a.members.map((m) => m.name).join(", ") || "—"} vs {c.current.b.members.map((m) => m.name).join(", ") || "—"}
                      </div>
                    ) : null}

                    <div className="px-5 pb-5 pt-3">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-faint">In line · {c.queue.length}</p>
                      {c.queue.length === 0 && c.forming.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-rule bg-bg/50 px-4 py-5 text-center text-sm font-medium text-faint">Be the first to start the line.</div>
                      ) : (
                        <div className="space-y-2">
                          {c.queue.map((t, i) => (
                            <div key={t.id} className="flex items-start gap-2.5 rounded-xl border border-rule bg-bg/40 px-3 py-2.5">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                {t.hold && t.wins > 0 ? (
                                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#fef9c3] px-2 py-0.5 text-[10px] font-bold text-[#a16207]">
                                    <Crown size={11} /> Staying · {t.wins}W
                                  </span>
                                ) : null}
                                <PlayerChips team={t} />
                              </div>
                            </div>
                          ))}
                          {c.forming.map((t) => (
                            <div key={t.id} className="flex items-start gap-2.5 rounded-xl border border-dashed border-rule px-3 py-2.5">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-rule text-[10px] font-bold text-mute">{t.count}/{t.size}</span>
                              <div className="min-w-0 flex-1">
                                <span className="mb-1 inline-block text-[10px] font-bold uppercase tracking-wide text-faint">Filling — {t.size - t.count} spot{t.size - t.count === 1 ? "" : "s"} open</span>
                                <PlayerChips team={t} muted />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-faint">
          <Trophy size={12} /> Powered by Klimr · <span className="font-mono font-semibold">{session.code}</span>
        </p>
      </div>
    </div>
  );
}
