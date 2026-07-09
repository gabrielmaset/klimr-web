"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarRange, Plus, MessageCircle, Bell, ChevronDown, Check, Settings, Users } from "lucide-react";
import { setPresenceMode } from "@/app/account/presence-actions";
import type { PresenceMode } from "@/app/account/presence";
import { TopSearch } from "@/components/top-search";
import { sportMeta } from "@/lib/sports";

const SPORT_LABEL: Record<string, string> = {
  tennis: "Tennis",
  pickleball: "Pickleball",
  padel: "Padel",
  racquetball: "Racquetball",
  beach_volleyball: "Beach volleyball",
};

const STATE = {
  online: { dot: "var(--color-success)", label: "Online" },
  away: { dot: "var(--color-warning)", label: "Away" },
  offline: { dot: "var(--color-faint)", label: "Offline" },
} as const;

// What the pill shows for each saved mode (auto resolves to online while the
// user is here and active).
function pillFor(mode: PresenceMode) {
  if (mode === "away") return STATE.away;
  if (mode === "offline") return STATE.offline;
  return STATE.online;
}

const OPTIONS: { mode: PresenceMode; dot: string; label: string; sub: string }[] = [
  { mode: "online", dot: STATE.online.dot, label: "Online", sub: "Others see you're active" },
  { mode: "away", dot: STATE.away.dot, label: "Away", sub: "Around, but not at the app" },
  { mode: "offline", dot: STATE.offline.dot, label: "Appear offline", sub: "Browse privately — hidden dot" },
  { mode: "auto", dot: STATE.online.dot, label: "Automatic", sub: "Online when you're active" },
];

// Compact, glanceable time for the next-match chip.
function whenShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `in ${diffMin}m`;

  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tmrw = new Date(now);
  tmrw.setDate(now.getDate() + 1);
  const isTmrw = d.toDateString() === tmrw.toDateString();
  if (sameDay) return `Today ${time}`;
  if (isTmrw) return `Tomorrow ${time}`;
  if (d.getTime() - now.getTime() < 7 * 86400000) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export type NextMatch = { id: string; sportKey: string; scheduledAt: string | null; place: string | null } | null;

function TeamSwitcher({ teams }: { teams: { id: string; name: string; sport_key: string }[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (teams.length === 0) return null;

  // Exactly one Pro team → switch straight in.
  if (teams.length === 1) {
    const t = teams[0];
    return (
      <Link
        href={`/team/${t.id}`}
        aria-label={`Switch to ${t.name}`}
        className="press ml-0.5 flex h-[34px] items-center gap-2 rounded-[10px] border border-rule-2 bg-surface pl-2 pr-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg text-[12px]">{sportMeta(t.sport_key).emoji}</span>
        <span className="hidden max-w-[7rem] truncate lg:inline">{t.name}</span>
      </Link>
    );
  }

  // Multiple Pro teams → a picker.
  return (
    <div className="relative ml-0.5">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch to a team"
        className="press flex h-[34px] items-center gap-2 rounded-[10px] border border-rule-2 bg-surface pl-2.5 pr-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
      >
        <Users size={16} className="shrink-0 text-mute" />
        <span className="hidden lg:inline">Teams</span>
        <ChevronDown size={15} className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-11 w-64 origin-top-right animate-[fade_0.12s_ease-out] overflow-hidden rounded-2xl border border-rule bg-surface shadow-e3"
        >
          <p className="kicker px-3.5 pb-1 pt-3 text-faint">Switch to a team</p>
          <div className="p-1">
            {teams.map((t) => (
              <Link
                key={t.id}
                href={`/team/${t.id}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-bg"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bg text-sm">{sportMeta(t.sport_key).emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{t.name}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconLink({ href, label, badge, children }: { href: string; label: string; badge: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={badge > 0 ? `${label}, ${badge} unread` : label}
      className="press inline-flex h-[34px] min-w-9 flex-[0_1_auto] items-center justify-center gap-1.5 overflow-hidden rounded-[10px] px-2.5 text-[13px] font-semibold text-mute transition-colors hover:bg-[rgba(32,27,18,0.05)] hover:text-ink"
    >
      <span className="shrink-0">{children}</span>
      <span className="min-w-0 truncate">{label}</span>
      {badge > 0 ? (
        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-brand px-1 font-mono text-[10px] font-bold leading-none text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function TopBar({
  chatUnread,
  unreadCount,
  presenceMode,
  nextMatch,
  teams,
}: {
  chatUnread: number;
  unreadCount: number;
  presenceMode: PresenceMode;
  nextMatch: NextMatch;
  teams: { id: string; name: string; sport_key: string; category: string }[];
}) {
  const [mode, setMode] = useState<PresenceMode>(presenceMode);
  const [seenProp, setSeenProp] = useState<PresenceMode>(presenceMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Reflect an externally-changed mode (e.g. from the Settings control) without
  // a sync effect: adjust state during render when the incoming prop changes.
  if (presenceMode !== seenProp) {
    setSeenProp(presenceMode);
    setMode(presenceMode);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function pick(next: PresenceMode) {
    setMenuOpen(false);
    if (next === mode) return;
    const prev = mode;
    setMode(next); // optimistic
    startTransition(async () => {
      const r = await setPresenceMode(next);
      if (!r?.ok) setMode(prev); // revert if the save didn't land
    });
  }

  const pill = pillFor(mode);
  const proTeams = teams.filter((t) => t.category === "pro");

  return (
    <div className="sticky top-0 z-40 hidden bg-bg px-[22px] pb-2.5 pt-3.5 md:block">
    <header className="flex items-center gap-[9px] rounded-2xl border border-rule bg-[#FFFDF8] px-3 py-[9px] shadow-bar">
        {/* Inline search — type here, results drop down below (no modal) */}
        <TopSearch />

        {/* Next scheduled match — only when there is one */}
        {nextMatch ? (
          <Link
            href={`/play/${nextMatch.id}`}
            aria-label={`Next match: ${SPORT_LABEL[nextMatch.sportKey] ?? "match"} ${whenShort(nextMatch.scheduledAt)}`}
            className="inline-flex h-[34px] min-w-0 flex-[0_1_auto] items-center gap-2 overflow-hidden rounded-[10px] border border-tint-brand-bd bg-tint-brand px-2.5"
          >
            <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <span className="shrink-0 font-mono text-[9.5px] font-bold uppercase tracking-[.16em] text-flame-text">Next</span>
            <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
              {SPORT_LABEL[nextMatch.sportKey] ?? "Match"} · {whenShort(nextMatch.scheduledAt)}
              {nextMatch.place ? ` · ${nextMatch.place}` : ""}
            </span>
          </Link>
        ) : null}

        {/* Right cluster — one filled control (Match), everything else ghost */}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <IconLink href="/calendar" label="Calendar" badge={0}>
            <CalendarRange size={17} />
          </IconLink>
          <IconLink href="/chats" label="Chats" badge={chatUnread}>
            <MessageCircle size={17} />
          </IconLink>

          <IconLink href="/notifications" label="Notifications" badge={unreadCount}>
            <Bell size={17} />
          </IconLink>

          {/* Switch into a team workspace (Pro teams only) */}
          <TeamSwitcher teams={proTeams} />

          {/* Presence */}
          <div className="relative ml-0.5">
            <button
              ref={btnRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Status: ${pill.label}. Change your status`}
              className="press flex h-[34px] items-center gap-2 rounded-[10px] border border-rule-2 bg-surface pl-2.5 pr-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: pill.dot }} aria-hidden />
              <span className="hidden lg:inline">{pill.label}</span>
              <ChevronDown size={15} className={`text-faint transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                className="absolute right-0 top-11 w-60 origin-top-right animate-[fade_0.12s_ease-out] overflow-hidden rounded-2xl border border-rule bg-surface shadow-e3"
              >
                <p className="kicker px-3.5 pb-1 pt-3 text-faint">Set yourself as</p>
                <div className="p-1">
                  {OPTIONS.map((o) => {
                    const sel = o.mode === mode;
                    return (
                      <button
                        key={o.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sel}
                        onClick={() => pick(o.mode)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${sel ? "bg-bg" : "hover:bg-bg"}`}
                      >
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 self-start rounded-full" style={{ background: o.dot }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-semibold ${sel ? "text-brand-deep" : "text-ink"}`}>{o.label}</span>
                          <span className="block text-xs text-faint">{o.sub}</span>
                        </span>
                        {sel ? <Check size={15} className="mt-0.5 shrink-0 self-start text-brand-deep" /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-rule">
                  <Link href="/settings/profile" onClick={() => setMenuOpen(false)} role="menuitem" className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-mute transition-colors hover:bg-bg">
                    <Settings size={15} className="text-mute" /> Status &amp; privacy settings
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <Link
            href="/play/new"
            aria-label="Organize a match"
            className="press ml-2 inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]"
            style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
          >
            <Plus size={16} className="shrink-0" />
            Match
          </Link>
        </div>
    </header>
    </div>
  );
}
