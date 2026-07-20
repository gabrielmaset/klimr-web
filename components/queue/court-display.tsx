"use client";

import { useEffect, useRef, useState, useTransition, useSyncExternalStore } from "react";
import { KlimrMark } from "@/components/logo";
import QRCode from "qrcode";
import { Crown, Play, Clock, Maximize, Minimize } from "lucide-react";
import type { QSessionState, QTeam } from "@/lib/queue";
import { teamDisplayName } from "@/lib/queue";
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

/** One-line name with a courtside marquee when it overflows: hold 2 s at the
 *  start, glide to reveal the end, hold 2 s, glide home — forever. Measured in
 *  an effect and driven by the Web Animations API (no state, no re-renders):
 *  short names never animate; long ones stay on a single line everywhere. */
function MarqueeText({ text }: { text: string }) {
  const outer = useRef<HTMLSpanElement | null>(null);
  const inner = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const o = outer.current;
    const el = inner.current;
    if (!o || !el) return;
    const shift = el.scrollWidth - o.clientWidth;
    if (shift <= 4) return;
    const scrollSec = Math.max(0.9, shift / 55);
    const total = 2 + scrollSec + 2 + scrollSec;
    const anim = el.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: 2 / total },
        { transform: `translateX(${-shift}px)`, offset: (2 + scrollSec) / total },
        { transform: `translateX(${-shift}px)`, offset: (2 + scrollSec + 2) / total },
        { transform: "translateX(0)", offset: 1 },
      ],
      { duration: total * 1000, iterations: Infinity, easing: "linear" },
    );
    return () => anim.cancel();
  }, [text]);
  return (
    <span ref={outer} className="block overflow-hidden whitespace-nowrap">
      <span ref={inner} className="inline-block will-change-transform">{text}</span>
    </span>
  );
}

function StackedNames({ team, className }: { team: QTeam; className?: string }) {
  if (!team.members.length) return <p className={className}>—</p>;
  return (
    <div className="space-y-1">
      {team.members.map((m, i) => (
        <p key={i} className={`leading-tight ${className ?? ""}`}>
          <MarqueeText text={m.name} />
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

/** Press-and-hold to confirm: a left-to-right fill acts as a 3-second countdown so a stray tap can't end a match.
 *  Hard-won iOS rules — do not "clean up": (1) NO onPointerLeave cancel — with pointer
 *  capture a drifting sweaty finger keeps the hold; releasing early is the only user
 *  cancel. (2) touch-action:none AND -webkit-touch-callout:none are both required — a
 *  3s press sits deep in Safari's long-press territory, and without the callout kill
 *  Safari fires pointercancel mid-hold even when the finger never moves. */
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
      onContextMenu={(e) => e.preventDefault()}
      className="press relative w-full select-none overflow-hidden rounded-[1.4vw] font-display font-bold text-[#0a0f1f] transition disabled:opacity-60"
      style={{ background: color, touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", fontSize: "clamp(1.1rem,2vw,2rem)" }}
    >
      <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${progress * 100}%` }} aria-hidden />
      <span className="relative flex flex-col items-center justify-center gap-0.5 py-[2.1vh] leading-none">
        <span>{label}</span>
        <span className="text-[0.46em] font-bold uppercase tracking-[0.18em] opacity-75">{active ? "Keep holding to confirm" : "Press & hold to confirm"}</span>
      </span>
    </button>
  );
}

const subscribeNever = () => () => {};
const originSnapshot = () => window.location.origin;
const emptySnapshot = () => "";

export function CourtDisplay({ initial, courtId, canOperate, code, enteredCode, isApp = false }: { initial: QSessionState; courtId: string; canOperate: boolean; code?: string; enteredCode?: string; isApp?: boolean }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [now, setNow] = useState(() => Date.now());
  // Origin is only knowable in the browser; the store pattern keeps SSR and
  // hydration rendering "" (no mismatch) and fills it right after.
  const origin = useSyncExternalStore(subscribeNever, originSnapshot, emptySnapshot);
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


  const walkUrl = origin ? `${origin}/q/${state.session.code}` : "";
  const hostPath = walkUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");

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
    const teamName = teamDisplayName(state.session.teamNameMode, side, team);
    const cap = state.session.winCap;
    const newWins = team.wins + 1;
    if (cap > 1 && newWins >= cap) showNote(`${teamName} hit ${cap} wins 🏆 — two fresh teams are up`);
    else if (cap > 1) showNote(`${teamName} stays on — win ${newWins} of ${cap}`);
    else showNote(`${teamName} won — next teams up`);
    act(code ? gameOverByCode : gameOver, code ? { code, matchId, winnerTeamId: team.id } : { matchId, winnerTeamId: team.id });
  };
  const startNext = (cid: string) => act(code ? startNextByCode : startNextMatch, code ? { code, courtId: cid } : { courtId: cid });
  const stepDown = (teamId: string) => {
    showNote("Winner stepped down — next two are up");
    act(code ? stepDownByCode : stepDownTeam, code ? { code, teamId } : { teamId });
  };

  const sessionLive = state.session.status === "live";
  const sessionOver = state.session.status === "ended";
  // Reset-codes kick: this screen was opened with a display code; if the
  // session's current display code no longer matches, the organizer rotated
  // credentials — eject to the takeover (and, in the app, back to setup).
  const codesRotated = !!enteredCode && !!state.session.displayCode && enteredCode !== state.session.displayCode;
  const displayDead = sessionOver || codesRotated;

  // Native app bridge (KlimrCourtside iPad shell). The page announces the
  // session phase so the app can auto-return to its setup screen ~30s after a
  // day ends; "Start over" exits immediately. No-ops in normal browsers.
  useEffect(() => {
    if (!isApp) return;
    type BridgeWindow = Window & { webkit?: { messageHandlers?: { klimrCourtside?: { postMessage: (m: unknown) => void } } } };
    const bridge = (window as BridgeWindow).webkit?.messageHandlers?.klimrCourtside;
    bridge?.postMessage({ type: displayDead ? "ended" : "active" });
  }, [isApp, displayDead]);
  const exitToSetup = () => {
    type BridgeWindow = Window & { webkit?: { messageHandlers?: { klimrCourtside?: { postMessage: (m: unknown) => void } } } };
    (window as BridgeWindow).webkit?.messageHandlers?.klimrCourtside?.postMessage({ type: "exit" });
  };
  const sPaused = sessionLive && !!state.session.paused;
  const court = state.courts.find((c) => c.id === courtId);

  // FREEZE-BY-DERIVATION for organizer edits: the one setting that could
  // disrupt a RUNNING game is the formation — and the running match already
  // carries its own truth (the teams it was formed with). While a match is
  // live, the formation pill derives from the match; the moment it ends, the
  // court's latest value shows. Name and level edits apply immediately —
  // renaming a court mid-game is a fix, not a disruption. Pure data, no
  // memory, no refs (repo rules).
  const liveMatchSize = court?.current ? (court.current.a?.size ?? court.current.b?.size ?? court.teamSize) : null;
  const shownTeamSize = liveMatchSize ?? court?.teamSize ?? 0;

  const heldTeam = court ? court.queue.find((t) => t.hold && t.wins > 0) ?? null : null;
  const upNext = court ? court.queue.filter((t) => !t.hold).slice(0, 3) : [];
  const canStart = !!court && court.queue.length >= 2;
  const cap = state.session.winCap;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden text-white" style={{ background: "radial-gradient(120% 88% at 50% -12%, #0a0c12, #000000 62%)" }}>
      {/* top bar. Centered on purpose: in fullscreen, iPadOS floats its own ✕
          dismiss control at the top-left and the status bar stays over the top
          edge — so the safe-area padding clears the clock/battery, and centring
          the title + court row keeps both out from under the system chrome. */}
      <div className="px-[max(0.9rem,3vw)] pt-[max(1.4vh,env(safe-area-inset-top))]">
        <div className="relative flex min-h-9 items-center justify-center">
          <span className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-[0.5vw] text-white">
            <KlimrMark size={27} dot="brand" />
            <span className="logotype text-[clamp(1.35rem,2.35vw,2.25rem)] leading-none">klimr</span>
          </span>
          <p className="max-w-[52%] truncate text-center text-[clamp(0.7rem,1.3vw,1.15rem)] font-bold uppercase tracking-[0.26em] text-white/40">{state.session.title}</p>
          {isApp ? null : <button type="button" onClick={toggleFullscreen} className="press absolute right-0 top-1/2 inline-flex shrink-0 -translate-y-1/2 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[clamp(0.7rem,1vw,0.95rem)] font-semibold text-white/55 hover:bg-white/10" title={isFs ? "Leave full screen" : "Show full screen"}>
            {isFs ? <Minimize size={15} /> : <Maximize size={15} />} {isFs ? "Exit full screen" : "Full screen"}
          </button>}
        </div>
        <div className="mt-[1.2vh] flex flex-wrap items-center justify-center gap-x-[1.4vw] gap-y-2">
          <h1 className="font-display leading-none text-[clamp(2.2rem,5.4vw,5rem)]">{court?.label ?? "Court"}</h1>
          {court ? (
            <span className="rounded-full bg-white/12 px-[1.3vw] py-[0.9vh] font-display font-bold leading-none text-[clamp(1.1rem,2.2vw,2.1rem)]">{formationLabel(shownTeamSize)}</span>
          ) : null}
          {court && court.levels.length ? (
            <span className="rounded-full border border-white/15 px-[1.3vw] py-[0.9vh] font-semibold leading-none text-white/70 text-[clamp(0.9rem,1.7vw,1.6rem)]">{court.levels.map(levelLabel).join(" · ")}</span>
          ) : null}
          {sPaused ? (
            <span className="rounded-full px-[1.3vw] py-[0.9vh] font-display font-bold leading-none text-[#0a0f1f] text-[clamp(0.9rem,1.7vw,1.6rem)]" style={{ background: "#f5c518" }}>{`Paused${state.session.pausedByName ? ` · ${state.session.pausedByName}` : ""}`}</span>
          ) : null}
        </div>
      </div>

      {!sessionLive || codesRotated ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[1.5vh] px-6 text-center">
          <p className="font-display font-bold text-[clamp(1.8rem,4.5vw,3.6rem)]">{codesRotated ? "Codes were reset" : sessionOver ? "Session ended" : "The queue hasn\u2019t opened yet"}</p>
          <p className="max-w-[46ch] text-[clamp(0.95rem,1.6vw,1.5rem)] text-white/55">
            {codesRotated ? "The organizer issued fresh codes — grab the new display code from Organizer tools and start over." : sessionOver ? "Thanks for playing — the organizer can start a new session from the queue page." : "Hang tight — this screen wakes up the moment the organizer turns the queue on."}
          </p>
          {isApp && displayDead ? (
            <button type="button" onClick={exitToSetup} className="press mt-[1vh] rounded-full bg-white px-8 py-3.5 font-display text-[clamp(1rem,1.7vw,1.5rem)] font-bold text-[#0a0f1f]">
              Start over
            </button>
          ) : null}
        </div>
      ) : !court ? (
        <div className="grid flex-1 place-items-center text-white/60">This court was removed.</div>
      ) : court.current ? (
        <>
          {/* clock */}
          <div className="relative flex flex-col items-center justify-center pt-[1vh]">
            <div className="relative">
              <span className="absolute -left-[max(2rem,3vw)] top-1/2 flex h-[2.2vh] min-h-3.5 w-[2.2vh] min-w-3.5 -translate-y-1/2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5b3d] opacity-70" />
                <span className="relative inline-flex h-full w-full rounded-full bg-[#ff5b3d]" />
              </span>
              <span className="font-mono font-bold tabular" style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(3.6rem, 17vh, 13rem)", lineHeight: 0.95 }}>
                {clock(now - Date.parse(court.current.startedAt))}
              </span>
            </div>
            {note ? <div className="mt-[1vh] rounded-full border border-white/15 bg-white/10 px-5 py-2 text-[clamp(0.85rem,1.5vw,1.35rem)] font-bold backdrop-blur">{note}</div> : null}
          </div>

          {/* teams */}
          <div className="grid flex-1 grid-cols-1 gap-[max(0.6rem,2vw)] px-[max(0.75rem,3vw)] py-[2vh] landscape:grid-cols-2 md:grid-cols-2">
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
                  <div className="flex min-h-0 flex-1 overflow-y-auto px-[max(0.9rem,2.2vw)] py-[1vh]">
                    <div className="my-auto">
                      <StackedNames team={t} className="font-display font-semibold text-[clamp(1.35rem,2.9vw,2.9rem)]" />
                    </div>
                  </div>
                  {canOperate ? (
                    <div className="px-[1.6vw] pb-[1.6vh]">
                      <HoldButton label={`${teamDisplayName(state.session.teamNameMode, s.key, t)} won`} color={s.color} disabled={pending} onConfirm={() => recordWin(court.current!.matchId, s.key, t)} />
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
                <p className="text-[clamp(1.05rem,2vw,1.9rem)] font-bold uppercase tracking-[0.18em] text-[#f5c518]">
                  Winner stays on court · {heldTeam.wins} {heldTeam.wins === 1 ? "win" : "wins"}{cap > 1 ? ` of ${cap}` : ""}
                </p>
                <p className="mt-2 font-display font-bold leading-tight text-[clamp(2.2rem,5.2vw,4.6rem)]">{heldTeam.members.map((m) => m.name).join(" · ") || "—"}</p>
              </div>
              {canOperate ? (
                <div className="flex flex-col items-center gap-[1.6vh]">
                  <button
                    type="button"
                    disabled={pending || !canStart || sPaused}
                    onClick={() => startNext(court.id)}
                    className="press inline-flex items-center gap-[1vw] rounded-[1.4vw] bg-[#ff4e1b] px-[4vw] py-[2.4vh] font-display font-bold text-white transition hover:bg-[#d63a0f] disabled:opacity-40"
                    style={{ fontSize: "clamp(1.3rem,2.5vw,2.5rem)" }}
                  >
                    <Play size={"1.1em" as unknown as number} /> Start next match
                  </button>
                  {/* Sits beside Start next match and, mispressed, dissolves the
                      winning team — so it earns the same press-&-hold contract
                      as recording a win. */}
                  <HoldButton
                    label="Winners are done — call the next two"
                    color="#8b93a7"
                    disabled={pending}
                    onConfirm={() => stepDown(heldTeam.id)}
                  />
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
                  disabled={pending || !canStart || sPaused}
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
      {sessionLive ? (
      <div className="shrink-0 border-t border-white/10 px-[max(0.9rem,3vw)] pt-[1.6vh] pb-[max(1.6vh,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-[1.4vh] landscape:flex-row landscape:items-stretch landscape:gap-[2vw] lg:flex-row lg:items-stretch lg:gap-[2vw]">
          <div className="min-w-0 flex-1">
            <p className="mb-[1vh] text-[clamp(0.65rem,1vw,0.95rem)] font-bold uppercase tracking-[0.22em] text-white/50">Next up in line</p>
            {upNext.length === 0 ? (
              <p className="text-[clamp(0.9rem,1.4vw,1.4rem)] text-white/45">No teams waiting.</p>
            ) : (
              <div className="grid grid-cols-1 gap-[max(0.5rem,1.5vw)] landscape:grid-cols-3 md:grid-cols-3">
                {upNext.map((t, i) => (
                  <div key={t.id} className="flex flex-col gap-[0.4rem] rounded-[max(0.6rem,1.2vw)] border border-white/10 bg-white/[0.05] px-[max(0.75rem,1.4vw)] py-[max(0.5rem,1.3vh)]">
                    <div className="flex items-start gap-[max(0.5rem,1vw)]">
                      <span className="grid shrink-0 place-items-center rounded-full bg-white/15 font-display font-bold text-white" style={{ width: "clamp(2rem,3vw,3rem)", height: "clamp(2rem,3vw,3rem)", fontSize: "clamp(1rem,1.6vw,1.6rem)" }}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <StackedNames team={t} className="font-semibold leading-snug text-white text-[clamp(1.1rem,1.9vw,1.85rem)]" />
                      </div>
                    </div>
                    {t.queuedAt ? (
                      <p className="flex items-center gap-1 text-[clamp(0.6rem,0.95vw,0.9rem)] font-medium text-white/45">
                        <Clock size={"1em" as unknown as number} /> in line since {joinedAt(t.queuedAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {walkUrl ? (
            <div className="flex shrink-0 items-center gap-[1.4vw] self-start rounded-[1.2vw] border border-white/15 bg-white/[0.07] px-[1.6vw] py-[1.2vh] landscape:self-stretch lg:self-stretch">
              {qr ? (
                <span
                  className="block shrink-0 rounded-[0.7vw] bg-white p-[0.7vh] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  style={{ width: "clamp(4.5rem,13vh,8.5rem)", height: "clamp(4.5rem,13vh,8.5rem)" }}
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
      ) : null}
    </div>
  );
}
