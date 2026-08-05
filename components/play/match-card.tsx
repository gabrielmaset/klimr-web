"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MapPin, ArrowRight, Check, Repeat } from "lucide-react";
import { SportIcon } from "@/components/sport-icons";
import { SPORT_TONES } from "@/components/sport-chip";
import { sportSlug } from "@/lib/sports";
import { joinMatch, joinWaitlist, leaveWaitlist, confirmWaitlistSpot, declineWaitlistSpot } from "@/app/play/[id]/actions";
import type { PlayMatch, Viewer } from "./play-browser";
import { OfferCountdown } from "./offer-countdown";

/** One match card — KLIMR-PLAY-HANDOFF §3e. Answers fast: sport, format,
 *  time, spots urgency, court + distance, players, host, one obvious action.
 *  Join is optimistic: the chip flips to YOU'RE IN and the roster updates
 *  before the server round-trip lands. */

function timeChip(iso: string | null, now: Date): string {
  if (!iso) return "ANYTIME · OPEN PLAY";
  const d = new Date(iso);
  const tmrw = new Date(now);
  tmrw.setDate(now.getDate() + 1);
  const day =
    d.toDateString() === now.toDateString()
      ? "TODAY"
      : d.toDateString() === tmrw.toDateString()
        ? "TOMORROW"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase().replace(",", "");
  return `${day} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function Disc({ name, url, hue, z }: { name: string; url: string | null; hue: number; z: number }) {
  return (
    <span
      className="relative inline-grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden rounded-full text-[9px] font-bold text-white ring-2 ring-white first:ml-0"
      style={{ zIndex: z, marginLeft: -7, background: url ? undefined : `linear-gradient(140deg, hsl(${hue} 72% 60%), hsl(${hue} 72% 42%))` }}
      title={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export function MatchCard({ m, viewer, now }: { m: PlayMatch; viewer: Viewer; now: Date | null }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(false);
  const tone = SPORT_TONES[sportSlug(m.sportKey)] ?? { fg: "var(--color-ink)", bg: "var(--color-bg)", bd: "var(--color-rule)" };

  const joined = m.isJoined || optimistic;
  const joinedCount = m.joinedCount + (optimistic ? 1 : 0);
  const spotsLeft = Math.max(0, m.totalSlots - joinedCount);
  const offered = !joined && m.wlStatus === "offered" && !!m.wlExpiresAt;
  const waitlisted = !joined && m.wlStatus === "waitlisted";
  const wlAct = (fn: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set("matchId", m.id);
    startTransition(async () => {
      await fn(fd);
    });
  };
  const players = optimistic ? [...m.players, { name: viewer.name, url: viewer.url, hue: viewer.hue }].slice(0, 4) : m.players;

  const onJoin = () => {
    setOptimistic(true);
    const fd = new FormData();
    fd.set("matchId", m.id);
    startTransition(() => {
      void joinMatch(fd);
    });
  };

  const spotsChip =
    spotsLeft === 0 ? (
      <span className="shrink-0 rounded-[8px] border px-2 py-[3.5px] font-mono text-[10.5px] font-bold tracking-[.05em]" style={{ background: "var(--color-bg)", borderColor: "var(--color-rule-2)", color: "var(--color-faint)" }}>
        FULL
      </span>
    ) : spotsLeft === 1 ? (
      <span className="shrink-0 rounded-[8px] border px-2 py-[3.5px] font-mono text-[10.5px] font-bold tracking-[.05em]" style={{ background: "var(--color-tint-brand)", borderColor: "var(--color-tint-brand-bd)", color: "var(--color-flame-text)" }}>
        1 SPOT LEFT
      </span>
    ) : (
      <span className="shrink-0 rounded-[8px] border px-2 py-[3.5px] font-mono text-[10.5px] font-bold tracking-[.05em]" style={{ background: "#EFF8F0", borderColor: "#CFE8D5", color: "#217A34" }}>
        {spotsLeft} SPOTS OPEN
      </span>
    );

  return (
    <div
      className="group rounded-[15px] border transition-all hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
      style={
        offered
          ? { background: "var(--color-tint-brand)", borderColor: "var(--color-tint-brand-bd)", boxShadow: "0 2px 10px rgba(214,58,15,.12)" }
          : { background: "var(--color-surface)", borderColor: "#EFE9DC", boxShadow: "0 1px 2px rgba(80,60,30,.04)" }
      }
    >
      {offered ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[14px] border-b px-3 py-2" style={{ borderColor: "var(--color-tint-brand-bd)", background: "rgba(255,255,255,.55)" }}>
          <span className="font-mono text-[10.5px] font-bold tracking-[.08em]" style={{ color: "var(--color-flame-text)" }}>
            YOUR SPOT IS READY
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-flame-text)" }}>
            confirm within <OfferCountdown expiresAt={m.wlExpiresAt!} />
          </span>
        </div>
      ) : null}
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] border" style={{ background: tone.bg, borderColor: tone.bd }}>
            <SportIcon sport={m.sportKey} variant="glyph" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-bold leading-tight text-ink">
              {m.sportName} · {m.formatLabel}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10.5px] font-bold tracking-[.04em] text-flame-text">{now ? timeChip(m.effectiveAt, now) : "\u00A0"}</span>
              {m.recurrence ? (
                <span className="inline-flex items-center gap-1 rounded-[7px] border px-1.5 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[.06em]" style={{ background: "var(--color-bg)", borderColor: "var(--color-rule-2)", color: "var(--color-faint)" }}>
                  <Repeat size={9} strokeWidth={2.75} /> {m.recurrence}
                </span>
              ) : null}
            </p>
          </div>
          {spotsChip}
        </div>

        <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
          {m.courtName ? (
            <>
              <MapPin size={13} className="shrink-0 text-faint" />
              <span className="truncate">{m.courtName}</span>
              {m.distanceMi != null ? <span className="shrink-0 font-mono text-[10px] font-semibold text-faint">{m.distanceMi.toFixed(1)} MI</span> : null}
            </>
          ) : (
            <span className="font-normal text-faint">Location TBD — host will confirm</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2" style={{ borderColor: "var(--color-rule-soft)" }}>
        <span className="flex pl-[7px]">
          {players.map((p, i) => (
            <Disc key={`${p.name}-${i}`} name={p.name} url={p.url} hue={p.hue} z={10 - i} />
          ))}
        </span>
        <span className="min-w-[100px] flex-[1_1_110px] truncate text-[11.5px] text-mute">
          <span className="font-mono font-bold text-ink-soft">
            {joinedCount}/{m.totalSlots}
          </span>{" "}
          · by {m.hostName}
          {m.isHost ? " (you)" : ""}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {joined ? (
            <span className="inline-flex items-center gap-1 rounded-[8px] border px-2 py-1 font-mono text-[10.5px] font-bold tracking-[.05em]" style={{ background: "#EFF8F0", borderColor: "#CFE8D5", color: "#217A34" }}>
              <Check size={10} strokeWidth={3} /> YOU&rsquo;RE IN
            </span>
          ) : offered ? (
            <>
              <button
                type="button"
                onClick={() => wlAct(confirmWaitlistSpot)}
                disabled={pending}
                className="press h-[30px] rounded-[9px] bg-brand px-3.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#E23E0D] disabled:opacity-60"
              >
                Confirm spot
              </button>
              <button
                type="button"
                onClick={() => wlAct(declineWaitlistSpot)}
                disabled={pending}
                className="press h-[30px] rounded-[9px] border border-rule bg-surface px-3 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-rule-2 hover:text-ink disabled:opacity-60"
              >
                Pass
              </button>
            </>
          ) : waitlisted ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-[8px] border px-2 py-1 font-mono text-[10.5px] font-bold tracking-[.05em]" style={{ background: "#FFF6E8", borderColor: "#F1DFC2", color: "#9A6B00" }}>
                WAITLISTED{m.wlPosition ? ` · #${m.wlPosition}` : ""}
              </span>
              <button
                type="button"
                onClick={() => wlAct(leaveWaitlist)}
                disabled={pending}
                className="press h-[30px] rounded-[9px] border border-rule bg-surface px-3 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-rule-2 hover:text-ink disabled:opacity-60"
              >
                Leave waitlist
              </button>
            </>
          ) : spotsLeft > 0 ? (
            <button
              type="button"
              onClick={onJoin}
              disabled={pending}
              className="press h-[30px] rounded-[9px] bg-ink px-3.5 text-[12.5px] font-bold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
            >
              Join
            </button>
          ) : (
            <button
              type="button"
              onClick={() => wlAct(joinWaitlist)}
              disabled={pending}
              className="press inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border border-rule bg-surface px-3 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-ink disabled:opacity-60"
            >
              Join waitlist
              {m.waitlistCount > 0 ? <span className="font-mono text-[10px] font-bold text-faint">· {m.waitlistCount}</span> : null}
            </button>
          )}
          <Link
            href={`/play/${m.id}`}
            className="press inline-flex h-[30px] items-center gap-1 rounded-[9px] border border-rule bg-surface px-3 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-rule-2 hover:text-ink"
          >
            View <ArrowRight size={12} strokeWidth={2.5} />
          </Link>
        </span>
      </div>
    </div>
  );
}
