"use client";

import { useEffect, useState, useTransition } from "react";
import { Crown, Play, X, Radio } from "lucide-react";
import type { QSessionState, QTeam } from "@/lib/queue";
import { clock, formationLabel, levelLabel } from "@/lib/queue";
import { useQueueState } from "@/components/queue/use-queue-state";
import { gameOver, startNextMatch } from "@/app/queue/actions";

function names(t: QTeam): string {
  return t.members.map((m) => m.name).join(" · ") || "—";
}

export function CourtDisplay({ initial, courtId, isOrganizer }: { initial: QSessionState; courtId: string; isOrganizer: boolean }) {
  const sid = initial.session.id;
  const { state, refetch } = useQueueState(sid, initial, 3000);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  // 1s clock for the match timer
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

  const act = (fn: (fd: FormData) => Promise<{ ok?: true; error?: string }>, fields: Record<string, string>) => {
    start(async () => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.append(k, v);
      await fn(f);
      await refetch();
    });
  };

  const court = state.courts.find((c) => c.id === courtId);
  const next2 = court ? court.queue.slice(0, 2) : [];

  return (
    <div className="fixed inset-0 z-[120] flex flex-col text-white" style={{ background: "radial-gradient(120% 90% at 50% 0%, #1a1340, #0b1020 60%)" }}>
      {/* top bar */}
      <div className="flex items-center justify-between px-6 py-4 sm:px-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">{state.session.title}</p>
          <h1 className="font-display text-2xl sm:text-3xl">
            {court?.label ?? "Court"} <span className="text-white/40">· {court ? formationLabel(court.teamSize) : ""}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {court && court.levels.length ? <span className="hidden rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70 sm:inline">{court.levels.map(levelLabel).join(" · ")}</span> : null}
          <a href={`/queue/${sid}`} className="press inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10">
            <X size={14} /> Exit
          </a>
        </div>
      </div>

      {!court ? (
        <div className="grid flex-1 place-items-center text-white/60">This court was removed.</div>
      ) : court.current ? (
        <>
          {/* timer */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Radio size={16} className="text-[#ff6a3d]" />
            <span className="font-mono text-3xl tabular sm:text-4xl" style={{ fontVariantNumeric: "tabular-nums" }}>
              {clock(now - Date.parse(court.current.startedAt))}
            </span>
          </div>

          {/* teams */}
          <div className="grid flex-1 grid-cols-1 items-stretch gap-4 px-6 py-4 sm:grid-cols-2 sm:px-10">
            {[court.current.a, court.current.b].map((t, idx) => (
              <div key={t.id} className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg font-bold">{idx === 0 ? "A" : "B"}</span>
                    {t.hold ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8b007]/20 px-2.5 py-1 text-sm font-bold text-[#f5c518]">
                        <Crown size={15} /> {t.wins}W streak
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-5 space-y-2">
                    {t.members.map((m, i) => (
                      <p key={i} className="text-2xl font-semibold leading-tight sm:text-3xl">
                        {m.name}
                        {m.isGuest ? <span className="ml-2 align-middle text-sm font-normal text-white/40">guest</span> : null}
                      </p>
                    ))}
                  </div>
                </div>
                {isOrganizer ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(gameOver, { matchId: court.current!.matchId, winnerTeamId: t.id })}
                    className="press mt-6 w-full rounded-2xl bg-[#16a34a] py-5 text-xl font-bold text-white hover:brightness-110 active:brightness-95 disabled:opacity-60"
                  >
                    {idx === 0 ? "Team A" : "Team B"} won
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <p className="text-2xl font-semibold text-white/70">{court.queue.length >= 2 ? "Ready for the next match" : "Waiting for teams to fill the queue"}</p>
          {isOrganizer ? (
            <button
              type="button"
              disabled={pending || court.queue.length < 2}
              onClick={() => act(startNextMatch, { courtId: court.id })}
              className="press inline-flex items-center gap-2 rounded-2xl bg-[#ff4e1b] px-10 py-6 text-2xl font-bold text-white hover:bg-[#d63a0f] disabled:opacity-40"
            >
              <Play size={26} /> Start next match
            </button>
          ) : null}
        </div>
      )}

      {/* next up */}
      <div className="border-t border-white/10 px-6 py-4 sm:px-10">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Next up</p>
        {next2.length === 0 ? (
          <p className="text-white/40">No teams waiting.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {next2.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold">{i + 1}</span>
                {t.hold ? <Crown size={15} className="shrink-0 text-[#f5c518]" /> : null}
                <span className="truncate text-lg font-medium text-white/85">{names(t)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
