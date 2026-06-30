"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Crown, Play, X } from "lucide-react";
import type { QSessionState, QTeam } from "@/lib/queue";
import { clock, formationLabel, levelLabel } from "@/lib/queue";
import { useQueueState } from "@/components/queue/use-queue-state";
import { gameOver, startNextMatch, gameOverByCode, startNextByCode } from "@/app/queue/actions";

type Side = { key: "A" | "B"; color: string; soft: string; ring: string };
const SIDES: Side[] = [
  { key: "A", color: "#ff6a3d", soft: "rgba(255,106,61,0.12)", ring: "rgba(255,106,61,0.45)" },
  { key: "B", color: "#22cfe0", soft: "rgba(34,207,224,0.12)", ring: "rgba(34,207,224,0.45)" },
];

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

export function CourtDisplay({ initial, courtId, canOperate, code }: { initial: QSessionState; courtId: string; canOperate: boolean; code?: string }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // keep the tablet awake (best effort)
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
    noteTimer.current = setTimeout(() => setNote(null), 7000);
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

  const court = state.courts.find((c) => c.id === courtId);
  const next2 = court ? court.queue.slice(0, 2) : [];
  const cap = state.session.winCap;
  const exitHref = code ? `/q/${code}` : `/queue/${sid}`;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden text-white" style={{ background: "radial-gradient(125% 95% at 50% -5%, #1c1147, #0a0f1f 58%)" }}>
      {/* top bar */}
      <div className="flex items-center justify-between gap-4 px-[3vw] pt-[2.2vh]">
        <div className="min-w-0">
          <p className="truncate text-[clamp(0.7rem,1.2vw,1rem)] font-bold uppercase tracking-[0.2em] text-white/45">{state.session.title}</p>
          <h1 className="font-display text-[clamp(1.6rem,3.4vw,3.2rem)] leading-none">
            {court?.label ?? "Court"} <span className="text-white/35">· {court ? formationLabel(court.teamSize) : ""}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {court && court.levels.length ? <span className="hidden rounded-full border border-white/15 px-3 py-1.5 text-[clamp(0.7rem,1vw,0.95rem)] font-semibold text-white/70 sm:inline">{court.levels.map(levelLabel).join(" · ")}</span> : null}
          <a href={exitHref} className="press inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-[clamp(0.7rem,1vw,0.95rem)] font-semibold text-white/60 hover:bg-white/10">
            <X size={15} /> Exit
          </a>
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
            {note ? (
              <div className="mt-[1vh] rounded-full border border-white/15 bg-white/10 px-5 py-2 text-[clamp(0.85rem,1.5vw,1.35rem)] font-bold backdrop-blur">
                {note}
              </div>
            ) : null}
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
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => recordWin(court.current!.matchId, s.key, t)}
                        className="press w-full rounded-[1.4vw] py-[2.2vh] font-display font-bold text-[#0a0f1f] transition hover:brightness-110 active:brightness-95 disabled:opacity-60"
                        style={{ background: s.color, fontSize: "clamp(1.1rem,2vw,2rem)" }}
                      >
                        Team {s.key} won
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] px-6 text-center">
          {note ? <div className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-[clamp(1rem,1.8vw,1.6rem)] font-bold backdrop-blur">{note}</div> : null}
          <p className="text-[clamp(1.4rem,3vw,2.6rem)] font-semibold text-white/70">{next2.length >= 2 ? "Ready for the next match" : "Waiting for teams to fill the queue"}</p>
          {canOperate ? (
            <button
              type="button"
              disabled={pending || next2.length < 2}
              onClick={() => startNext(court.id)}
              className="press inline-flex items-center gap-[1vw] rounded-[1.4vw] bg-[#ff4e1b] px-[4vw] py-[2.6vh] font-display font-bold text-white transition hover:bg-[#d63a0f] disabled:opacity-40"
              style={{ fontSize: "clamp(1.4rem,2.6vw,2.6rem)" }}
            >
              <Play size={"1.1em" as unknown as number} /> Start next match
            </button>
          ) : null}
        </div>
      )}

      {/* next up — previews the coming matchup, names stacked, A/B colour-coded */}
      <div className="border-t border-white/10 px-[3vw] py-[2vh]">
        <p className="mb-[1vh] text-[clamp(0.65rem,1vw,0.95rem)] font-bold uppercase tracking-[0.22em] text-white/40">Up next{next2.length >= 2 ? " · this matchup" : ""}</p>
        {next2.length === 0 ? (
          <p className="text-[clamp(0.9rem,1.4vw,1.4rem)] text-white/40">No teams waiting.</p>
        ) : (
          <div className="grid grid-cols-2 gap-[2vw]">
            {next2.map((t, i) => {
              const s = SIDES[i];
              return (
                <div key={t.id} className="flex items-start gap-[1.2vw] overflow-hidden rounded-[1.2vw] border bg-white/[0.04] px-[1.6vw] py-[1.4vh]" style={{ borderColor: s ? s.ring : "rgba(255,255,255,0.1)" }}>
                  <span className="grid shrink-0 place-items-center rounded-full font-display font-bold text-[#0a0f1f]" style={{ background: s ? s.color : "rgba(255,255,255,0.2)", width: "clamp(1.7rem,2.6vw,2.6rem)", height: "clamp(1.7rem,2.6vw,2.6rem)", fontSize: "clamp(0.8rem,1.3vw,1.3rem)" }}>
                    {s ? s.key : i + 1}
                  </span>
                  <div className="min-w-0">
                    {t.hold && t.wins > 0 ? (
                      <span className="mb-0.5 inline-flex items-center gap-1 text-[clamp(0.7rem,1vw,1rem)] font-bold text-[#f5c518]">
                        <Crown size={"1em" as unknown as number} /> staying · {t.wins}W
                      </span>
                    ) : null}
                    <StackedNames team={t} className="font-semibold text-white/90 text-[clamp(0.95rem,1.5vw,1.45rem)]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
