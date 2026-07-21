"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarPlus, UserPlus, Sparkles, Users, Flag, Megaphone, Newspaper, HeartPulse } from "lucide-react";

/** Feed v2 controls — Nearby/Your-circle segmented scope plus the underline
 *  type-tab bar with live count chips. Pure links so scope+type stay in the
 *  URL and views are shareable. No pills. */
export function FeedControls({
  scope,
  type,
  counts,
}: {
  scope: "nearby" | "circle";
  type: string;
  counts: Record<string, number>;
}) {
  const TABS: { key: string; label: string }[] = [
    { key: "all", label: "All" },
    { key: "match", label: "Matches" },
    { key: "photo", label: "Photos" },
    { key: "video", label: "Highlights" },
    { key: "ask", label: "Questions" },
    { key: "milestone", label: "Milestones" },
  ];
  const href = (s: string, t: string) => `/feed?scope=${s}${t === "all" ? "" : `&type=${t}`}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="inline-flex shrink-0 gap-0.5 rounded-[11px] bg-ink/5 p-[3px]">
          {(["nearby", "circle"] as const).map((s) => {
            const active = scope === s;
            return (
              <Link
                key={s}
                href={href(s, type)}
                className={`flex h-7 items-center rounded-lg border px-[13px] text-xs font-semibold transition-colors ${
                  active ? "border-rule-2 bg-surface text-ink shadow-[0_1px_2px_rgba(80,60,30,.08)]" : "border-transparent text-mute hover:text-ink"
                }`}
              >
                {s === "nearby" ? "Nearby" : "Your circle"}
              </Link>
            );
          })}
        </div>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-[9.5px] tracking-[0.12em] text-faint">NEWEST FIRST · ALWAYS</span>
      </div>

      <div className="flex items-stretch gap-0.5 overflow-x-auto border-b border-rule">
        {TABS.map((tab) => {
          const active = type === tab.key;
          return (
            <Link
              key={tab.key}
              href={href(scope, tab.key)}
              className={`relative inline-flex h-[38px] shrink-0 items-center gap-[7px] whitespace-nowrap px-[13px] text-[13px] font-semibold transition-colors ${
                active ? "text-ink" : "text-mute hover:text-ink"
              }`}
            >
              {tab.label}
              <span
                className={`min-w-5 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold transition-colors ${
                  active ? "bg-tint-brand text-brand-deep" : "bg-ink/5 text-faint"
                }`}
              >
                {counts[tab.key] ?? 0}
              </span>
              <span
                aria-hidden
                className={`absolute bottom-[-1px] left-[9px] right-[9px] h-[2.5px] rounded-t-[3px] ${active ? "bg-brand" : "bg-transparent"}`}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const DIGEST_ICONS: Record<string, LucideIcon> = {
  event: CalendarPlus,
  player: UserPlus,
  players: Users,
  team: Flag,
  announcement: Megaphone,
  news: Newspaper,
  training: HeartPulse,
  product: Sparkles,
};

export type WireDigestRow = { id: string; icon: keyof typeof DIGEST_ICONS; title: string; sub: string; time: string };

/** The old wire, folded into one compact digest card (shown on the All tab). */
export function WireDigest({ rows }: { rows: WireDigestRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 4);
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-rule bg-well px-5 py-3.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9.5px] font-bold tracking-[0.16em] text-faint">THE WIRE · CITY &amp; KLIMR UPDATES</span>
        <span className="flex-1" />
        {rows.length > 4 ? (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="press text-xs font-semibold text-brand-deep">
            {expanded ? "Show less" : "Open The Wire"}
          </button>
        ) : null}
      </div>
      <ul>
        {visible.map((w) => {
          const Icon = DIGEST_ICONS[w.icon] ?? Sparkles;
          return (
            <li key={w.id} className="flex items-center gap-2.5 border-b border-rule-soft py-2 last:border-b-0">
              <Icon size={14} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#4A453C]">
                <strong className="font-semibold text-ink">{w.title}</strong> — {w.sub}
              </span>
              <span className="shrink-0 font-mono text-[9.5px] text-faint">{w.time}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
