"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CalendarDays, ChevronDown, ChevronRight, Flag, Heart, HeartPulse, Medal,
  Megaphone, MessageSquare, Newspaper, ShoppingBag, Sparkles, TrendingUp, Trophy, UserPlus, Users,
} from "lucide-react";
import { SportIcon } from "@/components/sport-icons";
import { togglePostLike } from "@/app/feed/actions";

export type WireRow = {
  id: string;
  kind: string;
  label: string;
  accent: string;
  when: string; // ISO
  text: string;
  sub: string | null;
  href: string | null;
  sport: string | null;
  inCircle?: boolean;
  isPost?: boolean;
  postId?: string | null;
  likeCount?: number;
  liked?: boolean;
  names?: string[];
};

const ICONS: Record<string, typeof Megaphone> = {
  announcement: Megaphone, update: Sparkles, news: Newspaper, result: Trophy,
  player_joined: UserPlus, match_result: Trophy, event_published: CalendarDays,
  tournament_published: Medal, gear_listed: ShoppingBag, pro_verified: HeartPulse,
  team_formed: Flag, member_post: MessageSquare, ranking_move: TrendingUp, player_group: Users,
};

const VISIBLE_CAP = 45;
const ROLLUP_MIN = 3;

function timeShort(iso: string, nowMs: number): string {
  const m = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function dayLabel(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const today = new Date(nowMs);
  const strip = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((strip(today) - strip(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

type Block =
  | { t: "day"; key: string; label: string }
  | { t: "row"; key: string; row: WireRow; unseen: boolean }
  | { t: "rollup"; key: string; kind: string; label: string; accent: string; rows: WireRow[]; unseen: boolean };

/** THE WIRE — a dense, filterable ledger. Research-backed: users equate feed
 *  quality with information density and mourn missing compact modes; the most
 *  demanded third-party feed tool is type filtering; Strava's answer to
 *  volume is one grouped entry per shared happening. Rows here run ~44px,
 *  same-kind bursts roll up, days read like newspaper editions, the list is
 *  hard-capped (no infinite scroll), and unseen items carry a quiet dot. */
const subscribeNever = () => () => {};
const snapTrue = () => true;
const snapFalse = () => false;

export function FeedWire({ rows }: { rows: WireRow[] }) {
  // Day buckets ("Today"/"Yesterday") and times are the VIEWER's local calendar
  // — the server cannot know it. Rendering them at SSR caused React #418 (the
  // hydration crash that kills every click on the page). The whole wire waits
  // one frame for hydration instead; nothing here is SEO content.
  const mounted = useSyncExternalStore(subscribeNever, snapTrue, snapFalse);
  const [nowMs] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(Number.MAX_SAFE_INTEGER);

  useEffect(() => {
    try {
      const h = JSON.parse(window.localStorage.getItem("klimr.wire.hide") ?? "[]") as string[];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(new Set(h));
    } catch {
      /* fresh start */
    }
    const seen = Number(window.localStorage.getItem("klimr.wire.seen") ?? 0);
    setLastSeen(seen);
    const t = setTimeout(() => window.localStorage.setItem("klimr.wire.seen", String(Date.now())), 2500);
    return () => clearTimeout(t);
  }, []);

  const kindsPresent = useMemo(() => {
    const seenKinds = new Map<string, { label: string; accent: string }>();
    for (const r of rows) if (!seenKinds.has(r.kind)) seenKinds.set(r.kind, { label: r.label, accent: r.accent });
    return [...seenKinds.entries()];
  }, [rows]);

  const toggleKind = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      window.localStorage.setItem("klimr.wire.hide", JSON.stringify([...n]));
      return n;
    });

  const blocks = useMemo<Block[]>(() => {
    const vis = rows.filter((r) => !hidden.has(r.kind));
    const out: Block[] = [];
    let curDay = "";
    let i = 0;
    while (i < vis.length) {
      const r = vis[i];
      const dl = dayLabel(r.when, nowMs);
      if (dl !== curDay) {
        curDay = dl;
        out.push({ t: "day", key: `d-${dl}-${r.id}`, label: dl });
      }
      // roll up a same-kind, same-day burst (posts and player groups stay individual)
      if (!r.isPost && r.kind !== "player_group") {
        let j = i;
        while (j < vis.length && vis[j].kind === r.kind && dayLabel(vis[j].when, nowMs) === dl) j++;
        const run = vis.slice(i, j);
        if (run.length >= ROLLUP_MIN) {
          out.push({
            t: "rollup",
            key: `roll-${r.kind}-${r.id}`,
            kind: r.kind,
            label: r.label,
            accent: r.accent,
            rows: run,
            unseen: run.some((x) => Date.parse(x.when) > lastSeen),
          });
          i = j;
          continue;
        }
      }
      out.push({ t: "row", key: r.id, row: r, unseen: Date.parse(r.when) > lastSeen });
      i++;
    }
    return out;
  }, [rows, hidden, nowMs, lastSeen]);

  const shown = showAll ? blocks : blocks.slice(0, VISIBLE_CAP);
  const remaining = blocks.length - shown.length;

  if (!mounted) return <div aria-hidden className="min-h-[40vh]" />;

  return (
    <section className="mt-3 overflow-hidden rounded-[18px] border border-rule bg-surface shadow-e1">
      {/* filter strip — the most-demanded feed control, built in */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule-soft px-3 py-2.5">
        {kindsPresent.map(([k, m]) => {
          const off = hidden.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              aria-pressed={!off}
              className={`press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.12em] transition-all ${off ? "border-rule bg-bg text-faint opacity-60" : "border-transparent text-ink"}`}
              style={off ? undefined : { background: `color-mix(in oklab, ${m.accent} 13%, transparent)`, color: m.accent }}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: off ? "var(--color-faint)" : m.accent }} />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-rule-soft">
        {shown.map((b) => {
          if (b.t === "day") {
            return (
              <p key={b.key} className="bg-bg/70 px-4 py-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint">
                {b.label}
              </p>
            );
          }
          if (b.t === "rollup") {
            const Icon = ICONS[b.kind] ?? Newspaper;
            const open = expanded.has(b.key);
            return (
              <div key={b.key}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((e) => {
                      const n = new Set(e);
                      if (n.has(b.key)) n.delete(b.key);
                      else n.add(b.key);
                      return n;
                    })
                  }
                  aria-expanded={open}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-bg/60"
                >
                  {b.unseen ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /> : <span aria-hidden className="h-1.5 w-1.5 shrink-0" />}
                  <Icon size={14} className="shrink-0" style={{ color: b.accent }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                    <span className="font-bold">{b.rows.length} {b.label.toLowerCase()} updates</span>
                    <span className="text-mute"> — {b.rows.slice(0, 2).map((x) => x.text).join(" · ")}…</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-faint">{timeShort(b.rows[0].when, nowMs)}</span>
                  <ChevronDown size={14} className={`shrink-0 text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {open ? (
                  <div className="divide-y divide-rule-soft border-t border-rule-soft bg-bg/40">
                    {b.rows.map((r) => (
                      <WireLine key={r.id} row={r} nowMs={nowMs} unseen={Date.parse(r.when) > lastSeen} indent />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }
          return <WireLine key={b.key} row={b.row} nowMs={nowMs} unseen={b.unseen} />;
        })}
      </div>

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="press flex w-full items-center justify-center gap-1.5 border-t border-rule-soft px-4 py-2.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:bg-bg/60"
        >
          Show earlier <span className="font-mono text-[10.5px] text-faint">· {remaining} more</span>
        </button>
      ) : (
        <p className="border-t border-rule-soft px-4 py-2.5 text-center font-mono text-[9.5px] font-bold uppercase tracking-[.16em] text-faint">
          You&rsquo;re all caught up — the wire keeps recent days; older items retire
        </p>
      )}
    </section>
  );
}

function WireLine({ row, nowMs, unseen, indent }: { row: WireRow; nowMs: number; unseen: boolean; indent?: boolean }) {
  const Icon = ICONS[row.kind] ?? Newspaper;
  const [liked, setLiked] = useState(!!row.liked);
  const [count, setCount] = useState(row.likeCount ?? 0);
  const [busy, setBusy] = useState(false);

  async function like() {
    if (!row.postId || busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    const res = await togglePostLike(row.postId);
    if (!res.ok) {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
    }
    setBusy(false);
  }

  const body = (
    <>
      {unseen ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /> : <span aria-hidden className="h-1.5 w-1.5 shrink-0" />}
      <Icon size={14} className="shrink-0" style={{ color: row.accent }} aria-hidden />
      <span className={`min-w-0 flex-1 text-[13.5px] leading-snug text-ink ${row.isPost ? "" : "truncate"}`}>
        <span className="font-bold">{row.text}</span>
        {row.sub ? (
          <span className={`text-mute ${row.isPost ? "mt-0.5 block overflow-hidden text-[13px] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" : ""}`}>
            {row.isPost ? row.sub : ` — ${row.sub}`}
          </span>
        ) : null}
      </span>
      {row.sport ? <SportIcon sport={row.sport} variant="badge" size={14} className="opacity-90" /> : null}
      {row.inCircle ? <span className="shrink-0 rounded-full bg-tint-brand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.12em] text-brand-deep">Circle</span> : null}
      {row.isPost && row.postId ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void like();
          }}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className="press inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold transition-colors"
          style={{ color: liked ? "#E23E0D" : "var(--color-faint)" }}
        >
          <Heart size={13} fill={liked ? "currentColor" : "none"} aria-hidden /> {count > 0 ? count : ""}
        </button>
      ) : null}
      <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-faint">{timeShort(row.when, nowMs)}</span>
      {row.href ? <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden /> : <span className="w-[13px] shrink-0" aria-hidden />}
    </>
  );

  const cls = `flex items-center gap-2.5 px-4 ${row.isPost ? "py-2.5" : "py-2"} ${indent ? "pl-9" : ""} transition-colors hover:bg-bg/60`;
  return row.href ? (
    <Link href={row.href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
