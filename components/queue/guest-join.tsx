"use client";

import { useState, useTransition } from "react";
import { Crown, Plus, MapPin, Check, Loader2, Radio, Clock, Users } from "lucide-react";
import type { QSessionState, QTeam, QCourtState } from "@/lib/queue";
import { formationLabel, levelLabel } from "@/lib/queue";
import { sportMeta } from "@/lib/sports";
import { useQueueState } from "@/components/queue/use-queue-state";
import { joinCourtGuest, joinCourtFullTeam } from "@/app/queue/actions";

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

function joinedAt(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return isFinite(t) ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/** Big, high-contrast player chips — built to stay readable on a phone in direct sun. */
function Players({ team, muted }: { team: QTeam; muted?: boolean }) {
  if (!team.members.length) return <span className="text-sm font-semibold text-faint">Open spot</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {team.members.map((m, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold ring-1 ${
            m.you ? "bg-tint-brand text-brand-deep ring-brand/40" : muted ? "bg-white text-ink-soft ring-rule" : "bg-white text-ink ring-rule"
          }`}
        >
          <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white ${m.you ? "bg-brand" : "bg-ink"}`}>{(m.name.trim()[0] ?? "?").toUpperCase()}</span>
          {m.name}
          {m.isGuest ? <span className="text-[11px] font-semibold text-faint">guest</span> : null}
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
  const [teamCourt, setTeamCourt] = useState<string | null>(null);
  const [teamNames, setTeamNames] = useState<string[]>([]);

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
        setName(""); // ready for the next person to type
        setTimeout(() => setConfirm(""), 5000);
      }
      setJoiningCourt(null);
      await refetch();
    });
  };

  const openTeam = (court: QCourtState) => {
    setErr(null);
    setTeamCourt(court.id);
    setTeamNames(Array.from({ length: court.teamSize }, (_, i) => (i === 0 ? name.trim() : "")));
  };
  const closeTeam = () => {
    setTeamCourt(null);
    setTeamNames([]);
  };
  const setTeamName = (i: number, val: string) => setTeamNames((cur) => cur.map((n, j) => (j === i ? val : n)));

  const submitTeam = (court: QCourtState) => {
    setErr(null);
    const cleaned = teamNames.map((n) => n.trim());
    if (cleaned.some((n) => n.length < 1)) {
      setErr(`Enter all ${court.teamSize} player names.`);
      return;
    }
    setJoiningCourt(court.id);
    start(async () => {
      const coords = await getCoords();
      const f = new FormData();
      f.append("courtId", court.id);
      cleaned.forEach((n) => f.append("names", n));
      if (coords) {
        f.append("lat", String(coords.lat));
        f.append("lng", String(coords.lng));
      }
      const res = await joinCourtFullTeam(f);
      if (res?.error) {
        setErr(res.error === "location_required" ? "Allow location access so we can confirm you're on-site, then add your team again." : res.error);
      } else {
        setConfirm("joined");
        setName("");
        closeTeam();
        setTimeout(() => setConfirm(""), 5000);
      }
      setJoiningCourt(null);
      await refetch();
    });
  };

  const { session } = state;
  const courts = state.courts.filter((c) => !c.closed);
  const meta = sportMeta(session.sportKey);
  const open = session.status === "live";

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* header */}
        <div className="relative overflow-hidden rounded-[1.75rem] border border-rail-border bg-[linear-gradient(135deg,#1c1147,#0a0f1f)] px-6 py-8 text-white shadow-lg sm:px-8">
          <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none text-[150px] leading-none opacity-[0.08]">{meta.emoji}</span>
          <span aria-hidden className="pointer-events-none absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-brand/25 blur-3xl" />
          {open ? (
            <span className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Live
            </span>
          ) : null}
          <div className="relative flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/12 text-4xl backdrop-blur">{meta.emoji}</div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">{session.title}</h1>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-white/55">{meta.name} · walk-up sign-up</p>
            </div>
          </div>
        </div>

        {!open ? (
          <div className="mt-5 rounded-2xl border border-rule bg-surface shadow-e1 p-8 text-center text-base font-semibold text-mute">{session.status === "ended" ? "This session has ended." : "The queue isn't open yet — check back when play starts."}</div>
        ) : !session.allowGuests ? (
          <div className="mt-5 rounded-2xl border border-rule bg-surface shadow-e1 p-8 text-center text-base font-semibold text-mute">Walk-up sign-ups are turned off. Ask the organizer to add you.</div>
        ) : (
          <>
            {/* name + status (sticky on mobile so Join is always reachable) */}
            <div className="sticky top-3 z-10 mt-5">
              <div className="rounded-2xl border-2 border-rule bg-surface p-4 shadow-md sm:p-5">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-soft">Your name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex R."
                  maxLength={40}
                  className="w-full rounded-xl border-2 border-rule bg-bg px-4 py-3.5 text-lg font-semibold text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15 focus:bg-white"
                />
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-mute">
                  <MapPin size={13} /> {session.requireLocation ? "Joining shares your location once to confirm you're on-site." : "Tap Join on a court to grab its next open spot."}
                </p>
                {confirm === "joined" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#86efac] bg-[#f0fdf4] px-4 py-3 text-sm font-bold text-success">
                    <Check size={18} /> You&apos;re in! Find your name in the line below.
                  </div>
                ) : confirm === "pending" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#f5d08a] bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#b45309]">
                    <Check size={18} /> Request sent — waiting for the organizer to approve you.
                  </div>
                ) : null}
                {err ? <div className="mt-3 rounded-xl border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-sm font-bold text-[#b91c1c]">{err}</div> : null}
              </div>
            </div>

            {/* courts */}
            {courts.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-rule bg-surface shadow-e1 p-8 text-center text-base font-semibold text-mute">No open courts right now.</div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {courts.map((c, ci) => {
                  const busy = pending && joiningCourt === c.id;
                  const num = c.label.match(/\d+/)?.[0] ?? String(ci + 1);
                  return (
                    <div key={c.id} className="flex flex-col overflow-hidden rounded-3xl border-2 border-rule bg-surface shadow-sm">
                      {/* court header */}
                      <div className="flex items-center justify-between gap-3 border-b-2 border-rule bg-bg/60 px-4 py-4 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink font-display text-3xl font-bold leading-none text-white">{num}</span>
                          <div className="min-w-0">
                            <h2 className="truncate font-display text-2xl leading-tight text-ink">{c.label}</h2>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white shadow-md shadow-brand/25">{formationLabel(c.teamSize)}</span>
                              <span className="rounded-full border border-rule bg-white px-2.5 py-1 text-xs font-bold text-ink-soft">{c.levels.length ? c.levels.map(levelLabel).join(" · ") : "All levels"}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => join(c.id)}
                          className="press inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-6 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-deep disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} {session.requireApproval ? "Request" : "Join"}
                        </button>
                      </div>

                      {/* playing now */}
                      {c.current ? (
                        <div className="flex items-start gap-2 border-b border-rule bg-tint-success px-4 py-3 text-sm font-bold text-success sm:px-5">
                          <Radio size={16} className="mt-0.5 shrink-0" />
                          <span>Playing now · {c.current.a.members.map((m) => m.name).join(", ") || "—"} vs {c.current.b.members.map((m) => m.name).join(", ") || "—"}</span>
                        </div>
                      ) : null}

                      {/* in line */}
                      <div className="flex-1 px-4 py-4 sm:px-5">
                        <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                          In line · {c.queue.length}
                        </p>
                        {c.queue.length === 0 && c.forming.length === 0 ? (
                          <div className="rounded-2xl border-2 border-dashed border-rule bg-bg/40 px-4 py-6 text-center text-sm font-bold text-faint">Be the first to start the line.</div>
                        ) : (
                          <div className="space-y-2.5">
                            {c.queue.map((t, i) => (
                              <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-rule bg-bg/40 px-3 py-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-base font-bold text-white">{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {t.hold && t.wins > 0 ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-bold text-[#a16207]">
                                        <Crown size={12} /> Staying · {t.wins}W
                                      </span>
                                    ) : null}
                                    <Players team={t} />
                                  </div>
                                  {t.queuedAt ? <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-faint"><Clock size={11} /> in line since {joinedAt(t.queuedAt)}</p> : null}
                                </div>
                              </div>
                            ))}
                            {c.forming.map((t) => (
                              <div key={t.id} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-rule px-3 py-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-dashed border-rule text-xs font-bold text-mute">{t.count}/{t.size}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-mute ring-1 ring-rule">Filling · {t.size - t.count} open</span>
                                    <Players team={t} muted />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {session.allowFullTeams ? (
                        <div className="border-t-2 border-rule px-4 py-3.5 sm:px-5">
                          {teamCourt === c.id ? (
                            <div>
                              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Your full team · {c.teamSize} players</p>
                              <div className="space-y-2">
                                {teamNames.map((nm, i) => (
                                  <input
                                    key={i}
                                    value={nm}
                                    onChange={(e) => setTeamName(i, e.target.value)}
                                    placeholder={i === 0 ? "You" : `Player ${i + 1}`}
                                    maxLength={40}
                                    className="w-full rounded-xl border-2 border-rule bg-bg px-3.5 py-3 text-base font-semibold text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15 focus:bg-white"
                                  />
                                ))}
                              </div>
                              <div className="mt-2.5 flex gap-2">
                                <button type="button" disabled={pending} onClick={() => submitTeam(c)} className="press inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand py-3 text-base font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50 shadow-md shadow-brand/25">
                                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />} Add team to the line
                                </button>
                                <button type="button" disabled={pending} onClick={closeTeam} className="press rounded-full border-2 border-rule px-4 py-3 text-sm font-bold text-mute hover:bg-bg">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => openTeam(c)} className="press inline-flex items-center gap-2 text-sm font-bold text-brand-deep hover:underline">
                              <Users size={16} /> Bring your own full team
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-xs font-semibold text-faint">
          Powered by Klimr · session <span className="font-mono font-bold text-mute">{session.code}</span>
        </p>
      </div>
    </div>
  );
}
