"use client";

import { useState, useTransition } from "react";
import { Crown, Plus, Radio, MapPin, Check } from "lucide-react";
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

function names(t: QTeam): string {
  return t.members.map((m) => m.name).join(", ") || "—";
}

export function GuestJoin({ initial }: { initial: QSessionState }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"" | "joined" | "pending">("");

  const join = (courtId: string) => {
    setErr(null);
    if (name.trim().length < 2) {
      setErr("Enter your name first.");
      return;
    }
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
      await refetch();
    });
  };

  const { session, courts } = state;
  const meta = sportMeta(session.sportKey);
  const open = session.status === "live";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="text-center">
        <span className="text-3xl" aria-hidden>{meta.emoji}</span>
        <h1 className="mt-1 font-display text-3xl text-ink">{session.title}</h1>
        <p className="mt-1 text-sm text-mute">{meta.name} · walk-up sign-up</p>
      </div>

      {!open ? (
        <div className="mt-6 rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute">{session.status === "ended" ? "This session has ended." : "The queue isn't open yet — check back when play starts."}</div>
      ) : !session.allowGuests ? (
        <div className="mt-6 rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute">Walk-up sign-ups are turned off. Ask the organizer to add you.</div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-rule bg-surface p-4">
            <label className="mb-1 block text-xs font-semibold text-mute">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex R."
              maxLength={40}
              className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
            />
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
              <MapPin size={11} /> {session.requireLocation ? "Joining shares your location once to confirm you're on-site." : "Tap a court to join its next open team."}
            </p>
          </div>

          {confirm === "joined" ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-semibold text-success">
              <Check size={15} /> You&apos;re in! Find your name in the line below.
            </div>
          ) : confirm === "pending" ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#f5d08a] bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#b45309]">
              <Check size={15} /> Request sent — waiting for the organizer to approve you.
            </div>
          ) : null}
          {err ? <div className="mt-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium text-[#b91c1c]">{err}</div> : null}

          <div className="mt-4 space-y-4">
            {courts.map((c) => (
              <div key={c.id} className="rounded-2xl border border-rule bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg text-ink">{c.label}</h2>
                    <p className="text-xs text-mute">
                      {formationLabel(c.teamSize)} · {c.levels.length ? c.levels.map(levelLabel).join(", ") : "All levels"}
                    </p>
                  </div>
                  <button type="button" disabled={pending} onClick={() => join(c.id)} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
                    <Plus size={15} /> {session.requireApproval ? "Request" : "Join"}
                  </button>
                </div>

                {c.current ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
                    <Radio size={11} /> Playing now: <span className="text-ink-soft">{names(c.current.a)}</span> vs <span className="text-ink-soft">{names(c.current.b)}</span>
                  </p>
                ) : null}

                <div className="mt-3">
                  <p className="kicker mb-1.5 text-faint">In line · {c.queue.length}</p>
                  {c.queue.length === 0 && c.forming.length === 0 ? (
                    <p className="text-sm text-faint">Be the first to start the line.</p>
                  ) : (
                    <ol className="space-y-1">
                      {c.queue.map((t, i) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{i + 1}</span>
                          {t.hold ? <Crown size={12} className="text-[#a16207]" /> : null}
                          <span className="truncate text-ink-soft">{names(t)}</span>
                        </li>
                      ))}
                      {c.forming.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm text-faint">
                          <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-rule text-[10px] font-bold">
                            {t.count}/{t.size}
                          </span>
                          <span className="truncate">{names(t)} — filling</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 text-center text-xs text-faint">Powered by Klimr · <span className="font-mono">{session.code}</span></p>
    </div>
  );
}
