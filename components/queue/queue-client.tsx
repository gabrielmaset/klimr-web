"use client";

import { useEffect, useState, useTransition } from "react";
import { Crown, Play, X, Plus, Copy, Check, LogOut, Monitor, Radio, Square, UserCheck, Power, RotateCcw, ArrowLeft, Users } from "lucide-react";
import type { QSessionState, QCourtState, QTeam } from "@/lib/queue";
import { LEVELS, levelLabel, formationLabel, FORMATIONS } from "@/lib/queue";
import { sportMeta } from "@/lib/sports";
import { useQueueState } from "@/components/queue/use-queue-state";
import { joinCourt, leaveTeam, gameOver, startNextMatch, addCourt, removeCourt, startSession, endSession, removeTeam, approveRequest, denyRequest, cancelRequest, closeCourt, reopenCourt, setAllowFullTeams } from "@/app/queue/actions";

type Action = (fd: FormData) => Promise<{ ok?: true; error?: string }>;

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

function findTeam(state: QSessionState, teamId: string): { team: QTeam; court: QCourtState } | null {
  for (const c of state.courts) {
    if (c.current?.a.id === teamId) return { team: c.current.a, court: c };
    if (c.current?.b.id === teamId) return { team: c.current.b, court: c };
    const q = c.queue.find((t) => t.id === teamId);
    if (q) return { team: q, court: c };
    const f = c.forming.find((t) => t.id === teamId);
    if (f) return { team: f, court: c };
  }
  return null;
}

function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function MemberList({ team, canEdit, onRemove }: { team: QTeam; canEdit: boolean; onRemove: (m: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {team.members.map((m, i) => {
        const hue = hueFromName(m.name);
        return (
          <span key={i} className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold ring-1 ${m.you ? "bg-tint-brand text-brand-deep ring-brand/30" : "bg-white text-ink ring-rule"}`}>
            <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold" style={m.you ? { background: "var(--color-brand)", color: "#fff" } : { background: `hsl(${hue} 58% 90%)`, color: `hsl(${hue} 50% 30%)` }}>
              {(m.name.trim()[0] ?? "?").toUpperCase()}
            </span>
            {m.name}
            {m.isGuest ? <span className="text-[10px] font-medium text-faint">guest</span> : null}
            {canEdit ? (
              <button type="button" onClick={() => onRemove(m.name)} className="ml-0.5 text-faint hover:text-brand-deep" aria-label={`Remove ${m.name}`}>
                <X size={11} />
              </button>
            ) : null}
          </span>
        );
      })}
      {Array.from({ length: Math.max(0, team.size - team.count) }).map((_, i) => (
        <span key={`e${i}`} className="inline-flex items-center rounded-full border border-dashed border-rule px-2.5 py-1 text-[11px] font-medium text-faint">
          open
        </span>
      ))}
    </div>
  );
}

export function QueueClient({ initial, isOrganizer }: { initial: QSessionState; isOrganizer: boolean }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const run = (fn: Action, fd: FormData, withCoords = false) => {
    setErr(null);
    start(async () => {
      if (withCoords) {
        const c = await getCoords();
        if (c) {
          fd.set("lat", String(c.lat));
          fd.set("lng", String(c.lng));
        }
      }
      const res = await fn(fd);
      if (res?.error) setErr(res.error === "location_required" ? "Turn on location so we can confirm you're on-site, then tap Join again." : res.error);
      await refetch();
    });
  };

  const fd = (obj: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(obj)) f.append(k, v);
    return f;
  };

  const { session, courts, me } = state;
  const meta = sportMeta(session.sportKey);
  const winRule = session.winCap <= 1 ? "Teams play once, then re-form" : `Winners stay until ${session.winCap} wins, then re-form`;
  const myTeam = me ? findTeam(state, me.teamId) : null;
  const myPending = state.myPending;
  const courtLabel = (id: string) => courts.find((c) => c.id === id)?.label ?? "a court";
  const walkUrl = origin ? `${origin}/q/${session.code}` : "";

  return (
    <div className="space-y-5">
      {/* back to the event this queue belongs to */}
      <a href={session.eventId ? `/events/${session.eventId}` : "/events"} className="press inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ArrowLeft size={16} /> {session.eventId ? "Back to event page" : "Back to events"}
      </a>

      {/* header */}
      <div className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker mb-1.5 text-brand-deep">Player queue</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden>{meta.emoji}</span>
              <h1 className="truncate font-display text-2xl text-ink sm:text-3xl">{session.title}</h1>
            </div>
            <p className="mt-1 text-sm text-mute">
              {meta.name} · {winRule}
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold shadow-sm"
            style={
              session.status === "live"
                ? { background: "#16a34a", color: "#fff" }
                : session.status === "ended"
                  ? { background: "#f4f4f5", color: "#52525b" }
                  : { background: "#fff7e6", color: "#b45309" }
            }
          >
            {session.status === "live" ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
            ) : null}
            {session.status === "live" ? "Live" : session.status === "ended" ? "Ended" : "Setup"}
          </span>
        </div>

        {/* organizer: setup / start / share / end */}
        {isOrganizer ? (
          <div className="mt-4 border-t border-rule pt-4">
            {session.status === "setup" ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(startSession, fd({ sessionId: sid }), true)}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-60"
                >
                  <Play size={15} /> Start session
                </button>
                <span className="text-xs text-mute">{session.requireLocation ? "Uses your current location to verify players are on-site." : "Players can join once the session is live."}</span>
              </div>
            ) : session.status === "live" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (walkUrl) {
                        navigator.clipboard?.writeText(walkUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }
                    }}
                    className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg"
                  >
                    {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />} {copied ? "Copied" : "Copy walk-up link"}
                  </button>
                  {session.allowGuests ? <span className="text-xs text-faint">Walk-ups join at {walkUrl ? <span className="font-mono">{walkUrl.replace(/^https?:\/\//, "")}</span> : "your link"}</span> : <span className="text-xs text-faint">Walk-up sign-ups are off.</span>}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm("End the live queue for everyone? This closes the queue only and will not cancel the event or its recurring series.")) run(endSession, fd({ sessionId: sid }));
                    }}
                    className="press ml-auto inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-bg"
                  >
                    <Square size={12} /> End session
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rule bg-bg/40 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Users size={15} /> Full teams can join at once
                    </p>
                    <p className="mt-0.5 text-xs text-mute">Let a group drop a complete team straight into the line.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={session.allowFullTeams}
                    disabled={pending}
                    onClick={() => run(setAllowFullTeams, fd({ sessionId: sid, on: session.allowFullTeams ? "0" : "1" }))}
                    className="press relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
                    style={{ background: session.allowFullTeams ? "#16a34a" : "var(--color-rule)" }}
                    title="Let groups drop a complete team straight into the line"
                  >
                    <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform" style={{ transform: session.allowFullTeams ? "translateX(22px)" : "translateX(2px)" }} />
                  </button>
                </div>
                <p className="text-xs text-mute">
                  Courtside screen on a separate tablet? Open <span className="font-mono font-semibold text-ink">klimr.com/q</span> and enter code <span className="font-mono font-bold tracking-wider text-ink">{session.code}</span> + the court number.
                </p>
                <p className="text-xs text-faint">Ending the session closes this live queue only — it won&rsquo;t cancel the event or its recurring series.</p>
              </div>
            ) : (
              <p className="text-sm text-mute">This session has ended.</p>
            )}
          </div>
        ) : null}

        {/* player place-in-line / pending banner */}
        {!isOrganizer || myTeam || myPending ? (
          myTeam && me ? (
            <div className="mt-4 rounded-2xl bg-tint-brand px-4 py-3">
              {me.status === "playing" ? (
                <p className="text-sm font-semibold text-brand-deep">You&apos;re playing now on {myTeam.court.label} 🏐</p>
              ) : me.status === "queued" ? (
                <p className="text-sm font-semibold text-brand-deep">
                  You&apos;re #{me.place} in line on {myTeam.court.label} · {formationLabel(myTeam.court.teamSize)}
                </p>
              ) : (
                <p className="text-sm font-semibold text-brand-deep">
                  Your team is forming on {myTeam.court.label} — {myTeam.team.count}/{myTeam.team.size}. Grab {myTeam.team.size - myTeam.team.count} more!
                </p>
              )}
            </div>
          ) : myPending ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#fff7e6] px-4 py-3">
              <p className="text-sm font-semibold text-[#b45309]">Waiting for the organizer to approve you on {courtLabel(myPending.courtId)}…</p>
              <button type="button" disabled={pending} onClick={() => run(cancelRequest, fd({ requestId: myPending.id }))} className="press shrink-0 rounded-full border border-[#f5d08a] bg-white px-3 py-1 text-xs font-semibold text-[#b45309] hover:bg-[#fffaf0]">
                Cancel
              </button>
            </div>
          ) : session.status === "live" ? (
            <p className="mt-4 text-sm text-mute">Pick a court below to join the next open team.</p>
          ) : null
        ) : null}
      </div>

      {/* organizer: pending approvals */}
      {isOrganizer && state.pending.length > 0 ? (
        <div className="rounded-3xl border border-[#f5d08a] bg-[#fffaf0] p-5">
          <p className="kicker mb-3 flex items-center gap-1.5 text-[#b45309]">
            <UserCheck size={14} /> Approve players · {state.pending.length} waiting
          </p>
          <ul className="space-y-2">
            {state.pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {p.name}
                    {p.isGuest ? <span className="ml-1 text-xs font-normal text-faint">· walk-up</span> : null}
                  </p>
                  <p className="text-xs text-mute">wants to join {courtLabel(p.courtId)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" disabled={pending} onClick={() => run(approveRequest, fd({ requestId: p.id }))} className="press inline-flex items-center gap-1 rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-60">
                    <Check size={13} /> Approve
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(denyRequest, fd({ requestId: p.id }))} className="press rounded-full border border-rule bg-white px-2 py-1.5 text-faint hover:text-brand-deep" aria-label="Decline">
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {err ? <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium text-[#b91c1c]">{err}</div> : null}

      {/* courts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {courts.map((c, ci) => {
          const meHere = myTeam && myTeam.court.id === c.id;
          const meElsewhere = myTeam && myTeam.court.id !== c.id;
          const canStart = !c.current && c.queue.length >= 2;
          if (c.closed) {
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-3xl border border-dashed border-rule bg-bg/40 p-5">
                <div className="min-w-0">
                  <h2 className="font-display text-lg text-mute">{c.label}</h2>
                  <p className="mt-0.5 text-xs font-semibold text-faint">Closed · {formationLabel(c.teamSize)}</p>
                </div>
                {isOrganizer && session.status === "live" ? (
                  <button type="button" disabled={pending} onClick={() => run(reopenCourt, fd({ courtId: c.id }))} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg disabled:opacity-50">
                    <RotateCcw size={13} /> Reopen
                  </button>
                ) : null}
              </div>
            );
          }
          return (
            <div key={c.id} className="rounded-3xl border border-rule bg-surface p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg text-ink">{c.label}</h2>
                  <p className="mt-0.5 text-xs text-mute">
                    {formationLabel(c.teamSize)} · {c.levels.length ? c.levels.map(levelLabel).join(", ") : "All levels"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isOrganizer && session.status === "live" ? (
                    <a href={`/q/${session.code}/${ci + 1}`} target="_blank" rel="noreferrer" className="press inline-flex items-center gap-1 rounded-full border border-rule bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-bg" title="Open the login-free Courtside display for a tablet">
                      <Monitor size={12} /> Courtside
                    </a>
                  ) : null}
                  {isOrganizer && session.status === "live" && courts.length > 1 ? (
                    <button type="button" disabled={pending} onClick={() => run(closeCourt, fd({ courtId: c.id }))} className="press inline-flex items-center gap-1 rounded-full border border-rule bg-white px-2.5 py-1 text-[11px] font-semibold text-faint hover:text-brand-deep disabled:opacity-50" title="Stop using this court (end-of-day wind-down)">
                      <Power size={12} /> Stop
                    </button>
                  ) : null}
                  {isOrganizer && session.status !== "live" ? (
                    <button type="button" disabled={pending} onClick={() => run(removeCourt, fd({ courtId: c.id }))} className="press rounded-full border border-rule bg-white px-2 py-1 text-faint hover:text-brand-deep" aria-label="Remove court">
                      <X size={13} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* current match */}
              <div className="mt-4 rounded-2xl border border-rule bg-bg/50 p-3">
                {c.current ? (
                  <>
                    <p className="kicker mb-2 flex items-center gap-1 text-success">
                      <Radio size={11} /> On court now
                    </p>
                    <div className="space-y-2">
                      {[c.current.a, c.current.b].map((t, idx) => {
                        const sc = idx === 0 ? "#ff6a3d" : "#22cfe0";
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border-l-[3px] bg-surface px-3 py-2" style={{ borderLeftColor: sc }}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: sc }}>{idx === 0 ? "A" : "B"}</span>
                                {t.hold ? <Crown size={13} className="text-[#e8b007]" /> : null}
                                {t.wins > 0 ? <span className="rounded-full bg-tint-success px-1.5 text-[10px] font-bold text-success">{t.wins}W</span> : null}
                              </div>
                              <p className="mt-0.5 truncate text-sm font-medium text-ink">{t.members.map((m) => m.name).join(", ") || "—"}</p>
                            </div>
                            {isOrganizer ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(gameOver, fd({ matchId: c.current!.matchId, winnerTeamId: t.id }))}
                                className="press shrink-0 rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-60"
                              >
                                Won
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-mute">{c.queue.length >= 2 ? "Ready to start the next match." : "Waiting for two teams in the queue."}</p>
                    {isOrganizer ? (
                      <button
                        type="button"
                        disabled={pending || !canStart}
                        onClick={() => run(startNextMatch, fd({ courtId: c.id }))}
                        className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                      >
                        <Play size={13} /> Start next
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {/* queue */}
              <div className="mt-3">
                <p className="kicker mb-1.5 text-faint">Up next · {c.queue.length} in line</p>
                {c.queue.length === 0 ? (
                  <p className="text-sm text-faint">No teams waiting yet.</p>
                ) : (
                  <ol className="space-y-2">
                    {c.queue.map((t, i) => (
                      <li key={t.id} className="flex items-center gap-2.5 rounded-xl border border-rule bg-bg/30 px-3 py-2.5">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-brand text-white shadow-sm" : "border border-rule bg-surface text-mute"}`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {t.hold ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[10px] font-bold text-[#a16207]">
                                <Crown size={11} /> staying
                              </span>
                            ) : null}
                            {t.members.some((m) => m.you) ? <span className="rounded-full bg-tint-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-deep">you</span> : null}
                            <MemberList team={t} canEdit={false} onRemove={() => {}} />
                          </div>
                        </div>
                        {isOrganizer ? (
                          <button type="button" disabled={pending} onClick={() => run(removeTeam, fd({ teamId: t.id }))} className="press shrink-0 rounded-full p-1 text-faint hover:text-brand-deep" aria-label="Remove team">
                            <X size={14} />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* forming / open teams */}
              {c.forming.length > 0 ? (
                <div className="mt-3">
                  <p className="kicker mb-1.5 text-faint">Filling now</p>
                  <div className="space-y-2">
                    {c.forming.map((t) => (
                      <div key={t.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-rule px-3 py-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-dashed border-rule text-[10px] font-bold text-mute">
                          {t.count}/{t.size}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute ring-1 ring-rule">filling · {t.size - t.count} open</span>
                            <MemberList team={t} canEdit={false} onRemove={() => {}} />
                          </div>
                        </div>
                        {isOrganizer ? (
                          <button type="button" disabled={pending} onClick={() => run(removeTeam, fd({ teamId: t.id }))} className="press shrink-0 rounded-full p-1 text-faint hover:text-brand-deep" aria-label="Remove team">
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* join / leave (anyone, when live) */}
              {session.status === "live" ? (
                <div className="mt-4">
                  {meHere ? (
                    <button
                      type="button"
                      disabled={pending || me?.status === "playing"}
                      onClick={() => run(leaveTeam, fd({ teamId: myTeam!.team.id }))}
                      className="press inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-rule bg-white py-2.5 text-sm font-semibold text-ink-soft hover:bg-bg disabled:opacity-50"
                    >
                      <LogOut size={14} /> {me?.status === "playing" ? "Playing — can't leave" : "Leave team"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || !!meElsewhere || !!myPending}
                      onClick={() => run(joinCourt, fd({ courtId: c.id }), true)}
                      className="press inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                    >
                      <Plus size={15} /> {meElsewhere ? `You're in a team on ${myTeam!.court.label}` : myPending ? "Request sent — waiting" : `${session.requireApproval ? "Request to join" : "Join"} ${formationLabel(c.teamSize)}`}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* organizer: add court */}
      {isOrganizer && session.status !== "ended" ? <AddCourt sid={sid} pending={pending} run={run} /> : null}
    </div>
  );
}

function AddCourt({ sid, pending, run }: { sid: string; pending: boolean; run: (fn: Action, fd: FormData, c?: boolean) => void }) {
  const [size, setSize] = useState(4);
  const [levels, setLevels] = useState<string[]>([]);
  const toggle = (k: string) => setLevels((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  return (
    <div className="rounded-3xl border border-dashed border-rule bg-surface/60 p-5">
      <p className="kicker mb-3 flex items-center gap-1.5 text-ink-soft">
        <Plus size={13} /> Add a court
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-mute">Formation</label>
          <select value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))} className="rounded-xl border border-rule bg-white px-3 py-2 text-sm">
            {FORMATIONS.map((n) => (
              <option key={n} value={n}>
                {formationLabel(n)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-mute">Levels (optional)</label>
          <div className="flex gap-1.5">
            {LEVELS.map((l) => {
              const on = levels.includes(l.key);
              return (
                <button key={l.key} type="button" onClick={() => toggle(l.key)} className="press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors" style={{ borderColor: on ? "#ff4e1b" : "#e4e4e7", background: on ? "#fff1ed" : "white", color: on ? "#d63a0f" : "#71717a" }}>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const f = new FormData();
            f.append("sessionId", sid);
            f.append("courtSize", String(size));
            levels.forEach((l) => f.append("levels", l));
            run(addCourt, f);
            setLevels([]);
          }}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Add court
        </button>
      </div>
    </div>
  );
}
