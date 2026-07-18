"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ListOrdered, Pause, Play, Power, Tv } from "lucide-react";
import { setQueueEnabled, setEventQueuePaused } from "@/app/events/actions";

/**
 * The live-queue control card in Organizer tools. One mental switch:
 *   OFF      — blank slate; one big Turn on.
 *   RUNNING  — the session code takes center stage in large type (organizers
 *              read it off the screen to type into the Courtside iPad app far
 *              more often than they click it), with pause / display / settings
 *              beneath and both public links copyable.
 *   PAUSED   — amber, named ("Gabriel paused"), Resume front and center.
 */
export function EventQueueAdmin({
  eventId,
  queueEnabled,
  session,
}: {
  eventId: string;
  queueEnabled: boolean;
  session: { id: string; code: string; status: string; paused: boolean; pausedByName: string | null; firstCourtId: string | null } | null;
}) {
  const [pending, start] = useTransition();
  const live = queueEnabled && session?.status === "live";
  const paused = !!(live && session?.paused);

  const fd = (extra: Record<string, string>) => {
    const f = new FormData();
    f.append("eventId", eventId);
    for (const [k, v] of Object.entries(extra)) f.append(k, v);
    return f;
  };
  const turnOn = () => start(async () => { await setQueueEnabled(fd({ enabled: "1" })); });
  const turnOff = () => start(async () => { await setQueueEnabled(fd({})); });
  const setPause = (on: boolean) => start(async () => { await setEventQueuePaused(fd({ on: on ? "1" : "0" })); });

  return (
    <div className="rounded-3xl bg-[#0f2233] p-5 text-white shadow-e1">
      <div className="flex items-center gap-2.5">
        <p className="kicker text-white/45">Live queue · Admin</p>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${!live ? "bg-white/10 text-white/60" : paused ? "bg-[#f5c518] text-[#0a0f1f]" : "bg-emerald-400/15 text-emerald-300"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${!live ? "bg-white/40" : paused ? "bg-[#0a0f1f]" : "bg-emerald-300"}`} />
          {!live ? "Off" : paused ? "Paused" : "Running"}
        </span>
      </div>

      {!live ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-white/60">
            Turning it on starts play instantly — Court&nbsp;1 is ready and players can join.
            Turning it off clears everything for a fresh setup next time.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={turnOn}
            className="press mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-base font-bold text-white transition hover:bg-brand-deep disabled:opacity-60"
          >
            <Power size={17} /> Turn on the queue
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
              Session code · type it into the Courtside iPad app
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="font-mono text-4xl font-bold leading-none tracking-[0.24em] sm:text-5xl">{session!.code}</span>
              <CopyChip text={session!.code} label="Copy code" />
            </div>
          </div>

          {paused ? (
            <p className="rounded-2xl bg-[#f5c518]/10 px-3.5 py-2.5 text-sm font-semibold text-[#f5c518]">
              {session!.pausedByName ?? "An organizer"} paused the games — the match on court can finish, the next one waits.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {paused ? (
              <button type="button" disabled={pending} onClick={() => setPause(false)} className="press inline-flex items-center gap-1.5 rounded-full bg-[#f5c518] px-4 py-2 text-sm font-bold text-[#0a0f1f] transition hover:brightness-105 disabled:opacity-60">
                <Play size={15} /> Resume games
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => setPause(true)} className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60">
                <Pause size={15} /> Pause games
              </button>
            )}
            <a href={`/q/${session!.code}/1`} target="_blank" rel="noreferrer" className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              <Tv size={15} /> Courtside display
            </a>
            <Link href={`/queue/${session!.id}`} className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              <ListOrdered size={15} /> Queue settings
            </Link>
            <button type="button" disabled={pending} onClick={turnOff} className="press ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-60" title="Clears courts, teams, and settings — the code survives for printed posters">
            <Power size={14} /> Turn off
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <LinkChip label="Walk-up join" url={`www.klimr.com/q/${session!.code}`} />
            <LinkChip label="Courtside screen" url={`www.klimr.com/q/${session!.code}/1`} />
          </div>
        </div>
      )}
    </div>
  );
}

function CopyChip({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10"
      title={label}
    >
      {done ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function LinkChip({ label, url }: { label: string; url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(`https://${url}`).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="press flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 text-left transition hover:bg-white/10"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-white/40">{label}</span>
        <span className="block truncate font-mono text-[13px] text-white/85">{url}</span>
      </span>
      {done ? <Check size={14} className="shrink-0 text-emerald-300" /> : <Copy size={14} className="shrink-0 text-white/40" />}
    </button>
  );
}
