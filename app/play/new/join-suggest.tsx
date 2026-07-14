"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Users, MapPin, CalendarClock, ArrowRight, Loader2 } from "lucide-react";
import { findOpenMatches } from "./actions";
import { joinMatch } from "@/app/play/[id]/actions";
import { sportMeta } from "@/lib/sports";

type Suggestion = Awaited<ReturnType<typeof findOpenMatches>>;

/** "Join instead?" — as soon as a sport (and ideally a ZIP) is chosen, we
 *  crosscheck open matches nearby that need players. Non-blocking: the person
 *  can join in one tap or keep creating below. */
export function JoinSuggest({ sport, zip }: { sport: string; zip: string }) {
  const [rows, setRows] = useState<Suggestion>([]);
  const [checked, setChecked] = useState(false);
  const [joining, startJoin] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!sport) {
        setRows([]);
        setChecked(false);
        return;
      }
      void findOpenMatches(sport, zip).then((r) => {
        setRows(r);
        setChecked(true);
      });
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sport, zip]);

  if (!sport || !checked || rows.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-[#FFD9C2]" style={{ background: "linear-gradient(135deg,#FFF3EB,#FFFBF6)" }}>
      <div className="px-4 pt-3.5">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[.18em] text-flame-text">Before you create</p>
        <p className="mt-0.5 text-sm font-bold text-ink">
          {rows.length === 1 ? "An open match near you needs players" : `${rows.length} open matches near you need players`}
        </p>
        <p className="text-xs text-mute">Join one in a tap — or keep building your own below.</p>
      </div>
      <div className="mt-2.5 divide-y divide-[#F6DECD]">
        {rows.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-lg" aria-hidden>{sportMeta(sport).emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-ink">
                <span className="inline-flex items-center gap-1"><CalendarClock size={12} className="text-ink-soft" />{m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Anytime"}</span>
                {m.courtName ? <span className="inline-flex min-w-0 items-center gap-1 text-ink-soft"><MapPin size={12} /><span className="truncate">{m.courtName}</span>{m.distanceMi != null ? <span className="font-mono text-[10px] text-faint">· {m.distanceMi} mi</span> : null}</span> : null}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
                <Users size={11} /> {m.seated} of {m.total} seated · organized by {m.organizer}
              </span>
            </span>
            <button
              type="button"
              disabled={joining}
              onClick={() =>
                startJoin(async () => {
                  const fd = new FormData();
                  fd.set("matchId", m.id);
                  await joinMatch(fd);
                })
              }
              className="press inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
            >
              {joining ? <Loader2 size={13} className="animate-spin" /> : <>Join <ArrowRight size={12} /></>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
