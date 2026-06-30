"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Crown, Play, Clock, Maximize, Minimize } from "lucide-react";
import type { QSessionState, QTeam } from "@/lib/queue";
import { clock, formationLabel, levelLabel } from "@/lib/queue";
import { useQueueState } from "@/components/queue/use-queue-state";
import { gameOver, startNextMatch, gameOverByCode, startNextByCode, stepDownTeam, stepDownByCode } from "@/app/queue/actions";

type Side = { key: "A" | "B"; color: string; soft: string; ring: string };
const SIDES: Side[] = [
  { key: "A", color: "#ff6a3d", soft: "rgba(255,106,61,0.12)", ring: "rgba(255,106,61,0.45)" },
  { key: "B", color: "#22cfe0", soft: "rgba(34,207,224,0.12)", ring: "rgba(34,207,224,0.45)" },
];
const HOLD_MS = 3000;
const perfNow = () => performance.now();

function StackedNames({ team, className }: { team: QTeam; className?: string }) {
  if (!team.members.length) return <p className={className}>—</p>;
  return (
    <div className="space-y-1">
      {team.members.map((m, i) => (
        <p key={i} className={`leading-tight ${className ?? ""}`}>
          {m.name}
          {m.isGuest ? <span className="ml-2 align-middle text-[0.5em] font-normal uppercase tracking-wider text-white/35">guest</span> : null}
        </p>
      ))}
    </div>
  );
}

function joinedAt(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!isFinite(t)) return "";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function waited(iso: string | null, now: number): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!isFinite(ms) || ms < 60000) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m waiting`;
  return `${Math.floor(m / 60)}h ${m % 60}m waiting`;
}

/** Press-and-hold to confirm: a left-to-right fill acts as a 3-second countdown so a stray tap can't end a match. */
function HoldButton({ label, color, onConfirm, disabled }: { label: string; color: string; onConfirm: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const startT = useRef(0);
  const holding = useRef(false);

  const clear = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  const tick = () => {
    const p = Math.min(1, (perfNow() - startT.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      holding.current = false;
      clear();
      setProgress(0);
      onConfirm();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    holding.current = true;
    startT.current = perfNow();
    clear();
    raf.current = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (!holding.current) return;
    holding.current = false;
    clear();
    setProgress(0);
  };
  useEffect(() => () => clear(), []);

  const active = progress > 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      className="press relative w-full select-none overflow-hidden rounded-[1.4vw] font-display font-bold text-[#0a0f1f] transition disabled:opacity-60"
      style={{ background: color, touchAction: "none", fontSize: "clamp(1.1rem,2vw,2rem)" }}
    >
      <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${progress * 100}%` }} aria-hidden />
      <span className="relative flex flex-col items-center justify-center gap-0.5 py-[2.1vh] leading-none">
        <span>{label}</span>
        <span className="text-[0.46em] font-bold uppercase tracking-[0.18em] opacity-75">{active ? "Keep holding to confirm" : "Press & hold to confirm"}</span>
      </span>
    </button>
  );
}

export function CourtDisplay({ initial, courtId, canOperate, code }: { initial: QSessionState; courtId: string; canOperate: boolean; code?: string }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [now, setNow] = useState(() => Date.now());
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const walkUrl = origin ? `${origin}/q/${state.session.code}` : "";
  const hostPath = walkUrl.replace(/^https?:\/\//, "");

  useEffect(() => {
    if (!walkUrl) return;
    let alive = true;
    QRCode.toString(walkUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0a0f1f", light: "#ffffff" } })
      .then((svg) => {
        if (alive) setQr(svg);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [walkUrl]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  const showNote = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 8000);
  };

  const act = (fn: (fd: FormData) => Promise<{ ok?: true; error?: string }>, fields: Record<string, string>) => {
    start(async () => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.append(k, v);
      await fn(f);
      await refetch();
    });
  };

  const recordWin = (matchId: string, side: "A" | "B", team: QTeam) => {
    const cap = state.session.winCap;
    const newWins = team.wins + 1;
    if (cap > 1 && newWins >= cap) showNote(`Team ${side} hit ${cap} wins 🏆 — two fresh teams are up`);
    else if (cap > 1) showNote(`Team ${side} stays on — win ${newWins} of ${cap}`);
    else showNote(`Team ${side} won — next teams up`);
    act(code ? gameOverByCode : gameOver, code ? { code, matchId, winnerTeamId: team.id } : { matchId, winnerTeamId: team.id });
  };
  const startNext = (cid: string) => act(code ? startNextByCode : startNextMatch, code ? { code, courtId: cid } : { courtId: cid });
  const stepDown = (teamId: string) => {
    showNote("Winner stepped down — next two are up");
    act(code ? stepDownByCode : stepDownTeam, code ? { code, teamId } : { teamId });
  };

  const court = state.courts.find((c) => c.id === courtId);
  const heldTeam = court ? court.queue.find((t) => t.hold && t.wins > 0) ?? null : null;
  const upNext = court ? court.queue.filter((t) => !t.hold).slice(0, 3) : [];
  const canStart = !!court && court.queue.length >= 2;
  const cap = state.session.winCap;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden text-white" style={{ background: "radial-gradient(120% 88% at 50% -12%, #0c0e16, #050609 58%)" }}>
      {/* top bar — event + exit, then a bigger court/format/level row beneath it */}
      <div className="px-[3vw] pt-[2vh]">
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate text-[clamp(0.7rem,1.3vw,1.15rem)] font-bold uppercase tracking-[0.26em] text-white/40">{state.session.title}</p>
          <button type="button" onClick={toggleFullscreen} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[clamp(0.7rem,1vw,0.95rem)] font-semibold text-white/55 hover:bg-white/10" title={isFs ? "Leave full screen" : "Show full screen"}>
            {isFs ? <Minimize size={15} /> : <Maximize size={15} />} {isFs ? "Exit full screen" : "Full screen"}
          </button>
        </div>
        <div className="mt-[1.6vh] flex flex-wrap items-center gap-x-[1.4vw] gap-y-2">
          <h1 className="font-display leading-none text-[clamp(2.2rem,5.4vw,5rem)]">{court?.label ?? "Court"}</h1>
          {court ? (
            <span className="rounded-full bg-white/12 px-[1.3vw] py-[0.9vh] font-display font-bold leading-none text-[clamp(1.1rem,2.2vw,2.1rem)]">{formationLabel(court.teamSize)}</span>
          ) : null}
          {court && court.levels.length ? (
            <span className="rounded-full border border-white/15 px-[1.3vw] py-[0.9vh] font-semibold leading-none text-white/70 text-[clamp(0.9rem,1.7vw,1.6rem)]">{court.levels.map(levelLabel).join(" · ")}</span>
          ) : null}
        </div>
      </div>

      {!court ? (
        <div className="grid flex-1 place-items-center text-white/60">This court was removed.</div>
      ) : court.current ? (
        <>
          {/* clock */}
          <div className="relative flex flex-col items-center justify-center pt-[1vh]">
            <div className="flex items-center gap-[1.4vw]">
              <span className="relative flex h-[1.4vw] min-h-4 w-[1.4vw] min-w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5b3d] opacity-70" />
                <span className="relative inline-flex h-full w-full rounded-full bg-[#ff5b3d]" />
              </span>
              <span className="font-mono font-bold leading-none tabular" style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(5rem, 16vw, 20rem)" }}>
                {clock(now - Date.parse(court.current.startedAt))}
              </span>
            </div>
            {note ? <div className="mt-[1vh] rounded-full border border-white/15 bg-white/10 px-5 py-2 text-[clamp(0.85rem,1.5vw,1.35rem)] font-bold backdrop-blur">{note}</div> : null}
          </div>

          {/* teams */}
          <div className="grid flex-1 grid-cols-2 gap-[2vw] px-[3vw] py-[2vh]">
            {[court.current.a, court.current.b].map((t, idx) => {
              const s = SIDES[idx];
              return (
                <div key={t.id} className="relative flex min-h-0 flex-col overflow-hidden rounded-[2vw] border" style={{ borderColor: s.ring, background: s.soft }}>
                  <span className="absolute inset-x-0 top-0 h-[1vh] min-h-[6px]" style={{ background: s.color }} />
                  <div className="flex items-center justify-between gap-3 px-[2.2vw] pt-[2.6vh]">
                    <div className="flex items-center gap-[1vw]">
                      <span className="grid place-items-center rounded-full font-display font-bold text-[#0a0f1f]" style={{ background: s.color, width: "clamp(2.8rem,4.8vw,5rem)", height: "clamp(2.8rem,4.8vw,5rem)", fontSize: "clamp(1.4rem,2.6vw,2.8rem)" }}>
                        {s.key}
                      </span>
                      <span className="font-display font-bold uppercase tracking-[0.12em]" style={{ color: s.color, fontSize: "clamp(0.85rem,1.5vw,1.5rem)" }}>
                        Team {s.key}
                      </span>
                    </div>
                    {t.hold && t.wins > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[clamp(0.75rem,1.3vw,1.25rem)] font-bold" style={{ background: "rgba(245,197,24,0.16)", color: "#f5c518" }}>
                        <Crown size={"1.1em" as unknown as number} /> Win {t.wins} of {cap}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 items-center px-[2.2vw] py-[1.5vh]">
                    <StackedNames team={t} className="font-display font-semibold text-[clamp(1.1rem,2.3vw,2.2rem)]" />
                  </div>
                  {canOperate ? (
                    <div className="px-[1.6vw] pb-[1.6vh]">
                      <HoldButton label={`Team ${s.key} won`} color={s.color} disabled={pending} onConfirm={() => recordWin(court.current!.matchId, s.key, t)} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2.5vh] px-6 text-center">
          {note ? <div className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-[clamp(1rem,1.8vw,1.6rem)] font-bold backdrop-blur">{note}</div> : null}

          {heldTeam ? (
            <>
              <div>
                <p className="text-[clamp(0.8rem,1.4vw,1.3rem)] font-bold uppercase tracking-[0.2em] text-[#f5c518]">
                  Winner stays · {heldTeam.wins} {heldTeam.wins === 1 ? "win" : "wins"}{cap > 1 ? ` of ${cap}` : ""}
                </p>
                <p className="mt-1 font-display font-semibold text-[clamp(1.4rem,3.2vw,2.8rem)]">{heldTeam.members.map((m) => m.name).join(" · ") || "—"}</p>
              </div>
              {canOperate ? (
                <div className="flex flex-col items-center gap-[1.6vh]">
                  <button
                    type="button"
                    disabled={pending || !canStart}
                    onClick={() => startNext(court.id)}
                    className="press inline-flex items-center gap-[1vw] rounded-[1.4vw] bg-[#ff4e1b] px-[4vw] py-[2.4vh] font-display font-bold text-white transition hover:bg-[#d63a0f] disabled:opacity-40"
                    style={{ fontSize: "clamp(1.3rem,2.5vw,2.5rem)" }}
                  >
                    <Play size={"1.1em" as unknown as number} /> Start next match
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => stepDown(heldTeam.id)}
                    className="press rounded-full border border-white/20 px-[2.5vw] py-[1.4vh] font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-40"
                    style={{ fontSize: "clamp(0.85rem,1.5vw,1.4rem)" }}
                  >
                    Winners are done — call the next two in line
                  </button>
                  {!canStart ? <p className="text-[clamp(0.8rem,1.3vw,1.2rem)] text-white/40">No challengers in the queue yet.</p> : null}
                </div>
              ) : (
                <p className="text-[clamp(1.1rem,2vw,1.8rem)] text-white/60">Waiting for the next match to start…</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[clamp(1.4rem,3vw,2.6rem)] font-semibold text-white/70">{canStart ? "Ready for the next match" : "Waiting for teams to fill the queue"}</p>
              {canOperate ? (
                <button
                  type="button"
                  disabled={pending || !canStart}
                  onClick={() => startNext(court.id)}
                  className="press inline-flex items-center gap-[1vw] rounded-[1.4vw] bg-[#ff4e1b] px-[4vw] py-[2.6vh] font-display font-bold text-white transition hover:bg-[#d63a0f] disabled:opacity-40"
                  style={{ fontSize: "clamp(1.4rem,2.6vw,2.6rem)" }}
                >
                  <Play size={"1.1em" as unknown as number} /> Start next match
                </button>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* up next (place in line only, no A/B) + the walk-up link so newcomers can join */}
      <div className="border-t border-white/10 px-[3vw] py-[2vh]">
        <div className="flex flex-col gap-[1.6vh] xl:flex-row xl:items-stretch xl:gap-[2vw]">
          <div className="min-w-0 flex-1">
            <p className="mb-[1vh] text-[clamp(0.65rem,1vw,0.95rem)] font-bold uppercase tracking-[0.22em] text-white/50">Next up in line</p>
            {upNext.length === 0 ? (
              <p className="text-[clamp(0.9rem,1.4vw,1.4rem)] text-white/45">No teams waiting.</p>
            ) : (
              <div className="grid grid-cols-3 gap-[1.5vw]">
                {upNext.map((t, i) => (
                  <div key={t.id} className="flex items-start gap-[1vw] rounded-[1.2vw] border border-white/10 bg-white/[0.05] px-[1.4vw] py-[1.3vh]">
                    <span className="grid shrink-0 place-items-center rounded-full bg-white/15 font-display font-bold text-white" style={{ width: "clamp(1.7rem,2.6vw,2.6rem)", height: "clamp(1.7rem,2.6vw,2.6rem)", fontSize: "clamp(0.85rem,1.4vw,1.4rem)" }}>
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <StackedNames team={t} className="font-semibold text-white text-[clamp(0.9rem,1.4vw,1.35rem)]" />
                      {t.queuedAt ? (
                        <p className="mt-1 flex items-center gap-1 text-[clamp(0.6rem,0.95vw,0.9rem)] font-medium text-white/45">
                          <Clock size={"1em" as unknown as number} /> in line since {joinedAt(t.queuedAt)} · {waited(t.queuedAt, now)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {walkUrl ? (
            <div className="flex shrink-0 items-center gap-[1.4vw] self-start rounded-[1.2vw] border border-white/15 bg-white/[0.07] px-[1.6vw] py-[1.4vh] xl:self-stretch">
              {qr ? (
                <span
                  className="block shrink-0 rounded-[0.7vw] bg-white p-[0.7vh] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  style={{ width: "clamp(5.5rem,9vw,9rem)", height: "clamp(5.5rem,9vw,9rem)" }}
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-[clamp(0.62rem,0.95vw,0.9rem)] font-bold uppercase tracking-[0.2em] text-white/55">Join the line — scan or type</p>
                <p className="mt-1 break-all font-mono font-bold leading-tight text-white text-[clamp(1rem,1.9vw,1.9rem)]">{hostPath}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
