"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Pause, Play, Power, SlidersHorizontal } from "lucide-react";
import { setQueueEnabled, setEventQueuePaused, setEventCourtClosed } from "@/app/events/actions";

/**
 * The live-queue card in Organizer tools. One switch, three states:
 *   OFF     — one big Turn on; nothing else.
 *   RUNNING — the courts ARE the interface: each shows its display code in big
 *             mono (code + court number — what gets typed into the Courtside
 *             iPad), a display link, and Close/Reopen. Pause all up top.
 *   PAUSED  — amber, named, Resume front and center.
 * Off (manual or the 12-hour auto-off) clears everything; the code survives.
 */
export function EventQueueAdmin({
  eventId,
  queueEnabled,
  session,
}: {
  eventId: string;
  queueEnabled: boolean;
  session: { id: string; code: string; status: string; paused: boolean; pausedByName: string | null; courts: { id: string; label: string; index: number; closed: boolean }[] } | null;
}) {
  const [pending, start] = useTransition();
  const live = queueEnabled && session?.status === "live";
  const paused = !!(live && session?.paused);
  const courts = session?.courts ?? [];

  const fd = (extra: Record<string, string>) => {
    const f = new FormData();
    f.append("eventId", eventId);
    for (const [k, v] of Object.entries(extra)) f.append(k, v);
    return f;
  };

  return (
    <div className="flex h-full flex-col rounded-3xl bg-[#0f2233] p-5 text-white shadow-e1">
      <div className="flex items-center gap-2.5">
        <p className="kicker text-white/45">Live queue · Admin</p>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${!live ? "bg-white/10 text-white/60" : paused ? "bg-[#f5c518] text-[#0a0f1f]" : "bg-emerald-400/15 text-emerald-300"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${!live ? "bg-white/40" : paused ? "bg-[#0a0f1f]" : "bg-emerald-300"}`} />
          {!live ? "Off" : paused ? "Paused" : "Running"}
        </span>
      </div>

      {!live ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await setQueueEnabled(fd({ enabled: "1" })); })}
            className="press inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-base font-bold text-white transition hover:bg-brand-deep disabled:opacity-60"
          >
            <Power size={17} /> Turn on the queue
          </button>
          <p className="mt-2.5 text-xs text-white/45">Turning it off clears courts, players, and settings.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col gap-4">
          {paused ? (
            <p className="rounded-2xl bg-[#f5c518]/10 px-3.5 py-2.5 text-sm font-semibold text-[#f5c518]">
              {session!.pausedByName ?? "An organizer"} paused the games — matches on court can finish, the next ones wait.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {paused ? (
              <button type="button" disabled={pending} onClick={() => start(async () => { await setEventQueuePaused(fd({ on: "0" })); })} className="press inline-flex items-center gap-1.5 rounded-full bg-[#f5c518] px-4 py-2 text-sm font-bold text-[#0a0f1f] transition hover:brightness-105 disabled:opacity-60">
                <Play size={15} /> Resume all
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => start(async () => { await setEventQueuePaused(fd({ on: "1" })); })} className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60">
                <Pause size={15} /> Pause all
              </button>
            )}
            <Link href={`/queue/${session!.id}`} className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              <SlidersHorizontal size={15} /> {courts.length ? "Add / edit courts" : "Set up courts"}
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await setQueueEnabled(fd({})); })}
              className="press ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
              title="Clears courts, players, and settings — the code survives for printed posters"
            >
              <Power size={14} /> Turn off
            </button>
          </div>

          {courts.length ? (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                Court codes · type one into each Courtside iPad
              </p>
              <div className="space-y-2">
                {courts.map((c) => (
                  <div key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-3 ${c.closed ? "bg-white/[0.03]" : "bg-white/[0.06]"}`}>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${c.closed ? "text-white/40" : "text-white"}`}>{c.label}</span>
                      {c.closed ? <span className="text-[10px] font-bold uppercase tracking-wide text-white/35">Closed</span> : null}
                    </span>
                    <span className={`font-mono text-2xl font-bold leading-none tracking-[0.18em] sm:text-3xl ${c.closed ? "text-white/30" : "text-white"}`}>
                      {session!.code}{c.index}
                    </span>
                    <CopyChip text={`${session!.code}${c.index}`} />
                    <a href={`/q/${session!.code}/${c.index}`} target="_blank" rel="noreferrer" title="Open courtside display" className="press grid h-8 w-8 place-items-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10">
                      <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => { await setEventCourtClosed(fd({ courtId: c.id, closed: c.closed ? "0" : "1" })); })}
                      className="press rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-60"
                    >
                      {c.closed ? "Reopen" : "Close"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-white/70">No courts yet</p>
              <p className="mt-1 text-xs text-white/45">Add courts and name them your way — Court 1, Court A, Green Court…</p>
            </div>
          )}

          <div className="mt-auto">
            <LinkChip label="Walk-up join · players scan or open" url={`www.klimr.com/q/${session!.code}`} />
          </div>
        </div>
      )}
    </div>
  );
}

function CopyChip({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="press grid h-8 w-8 place-items-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10"
      title="Copy code"
    >
      {done ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
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
      className="press flex w-full items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 text-left transition hover:bg-white/10"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-white/40">{label}</span>
        <span className="block truncate font-mono text-[13px] text-white/85">{url}</span>
      </span>
      {done ? <Check size={14} className="shrink-0 text-emerald-300" /> : <Copy size={14} className="shrink-0 text-white/40" />}
    </button>
  );
}
