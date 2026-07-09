"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, MapPin, Users, CalendarDays, Loader2, CornerDownLeft, X } from "lucide-react";
import { globalSearch } from "@/app/search/actions";
import type { SearchResult, SearchResultType } from "@/app/search/types";
import { Compass } from "lucide-react";

type PageResult = { type: "page"; id: string; title: string; subtitle?: string; href: string };
type Result = SearchResult | PageResult;

const PAGES: PageResult[] = [
  { type: "page", id: "feed", title: "Home", subtitle: "Your feed", href: "/feed" },
  { type: "page", id: "play", title: "Play", subtitle: "Find or organize a match", href: "/play" },
  { type: "page", id: "rankings", title: "Rankings", subtitle: "The Mountain", href: "/rankings" },
  { type: "page", id: "tournaments", title: "Tournaments", subtitle: "Compete", href: "/tournaments" },
  { type: "page", id: "challenges", title: "Challenges", subtitle: "Turf wars", href: "/challenges" },
  { type: "page", id: "events", title: "Events", subtitle: "Compete", href: "/events" },
  { type: "page", id: "network", title: "Network", subtitle: "Community", href: "/network" },
  { type: "page", id: "chats", title: "Chats", subtitle: "Courtside", href: "/chats" },
  { type: "page", id: "teams", title: "Teams", subtitle: "Community", href: "/teams" },
  { type: "page", id: "invites", title: "Invites", subtitle: "Community", href: "/invites" },
  { type: "page", id: "discover", title: "Players", subtitle: "Match Lab", href: "/discover" },
  { type: "page", id: "courts", title: "Courts", subtitle: "Discover", href: "/courts" },
  { type: "page", id: "marketplace", title: "Marketplace", subtitle: "Discover", href: "/marketplace" },
  { type: "page", id: "classes", title: "Classes & Coaching", subtitle: "Discover", href: "/classes" },
  { type: "page", id: "sponsorships", title: "Sponsorships", subtitle: "Discover", href: "/sponsorships" },
  { type: "page", id: "resources", title: "Playbook", subtitle: "Rules & guides", href: "/resources" },
  { type: "page", id: "calendar", title: "Calendar", subtitle: "Your schedule", href: "/calendar" },
  { type: "page", id: "notifications", title: "Notifications", subtitle: "Your account", href: "/notifications" },
  { type: "page", id: "me", title: "My profile", subtitle: "Your account", href: "/me" },
  { type: "page", id: "settings", title: "Settings", subtitle: "Your account", href: "/settings" },
  { type: "page", id: "account", title: "Account", subtitle: "Sign-in & security", href: "/account" },
  { type: "page", id: "invite", title: "Invite friends", subtitle: "Your account", href: "/invite" },
];
const pageHits = (q: string) =>
  PAGES.filter((pg) => pg.title.toLowerCase().includes(q.toLowerCase()) || (pg.subtitle ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 5);
import { Avatar } from "@/components/avatar";

const TYPE_ICON: Record<SearchResultType, typeof User> = {
  player: User,
  court: MapPin,
  team: Users,
  event: CalendarDays,
};

export function TopSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const term = query.trim();
  const hasQuery = term.length >= 2;
  const showDropdown = open && hasQuery;
  const activeClamped = results.length ? Math.min(active, results.length - 1) : 0;

  useEffect(() => {
    const p = navigator.userAgent || navigator.platform || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time platform read on mount
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(p));
  }, []);

  // Debounced search — all state updates run inside the timeout callback.
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (term.length < 2) {
          if (id === reqId.current) {
            setResults([]);
            setActive(0);
            setLoading(false);
          }
          return;
        }
        if (id === reqId.current) setLoading(true);
        const r = await globalSearch(term);
        if (id === reqId.current) {
          setResults([...pageHits(term), ...r]);
          setActive(0);
          setLoading(false);
        }
      },
      term.length < 2 ? 0 : 180,
    );
    return () => clearTimeout(t);
  }, [term]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ⌘K / Ctrl+K focuses the inline search (no modal).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!showDropdown) return;
    document.getElementById(`top-opt-${activeClamped}`)?.scrollIntoView({ block: "nearest" });
  }, [activeClamped, showDropdown]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    inputRef.current?.blur();
    router.push(href);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setActive(0);
    inputRef.current?.focus();
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeClamped];
      if (item) go(item.href);
    }
  }

  return (
    <div ref={wrapRef} className="relative min-w-[120px] max-w-[290px] flex-[1_1_180px]">
      <div className="flex h-[34px] items-center gap-2 rounded-[10px] border border-rule-2 bg-[rgba(32,27,18,0.03)] px-3 transition-colors focus-within:border-brand focus-within:bg-surface">
        <Search size={16} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (hasQuery) setOpen(true);
          }}
          onKeyDown={onInputKey}
          placeholder="Search Klimr — pages, players, courts…"
          className="h-full w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="top-search-list"
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && results.length ? `top-opt-${activeClamped}` : undefined}
        />
        {loading && hasQuery ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-faint" />
        ) : query ? (
          <button type="button" onClick={clear} aria-label="Clear search" className="shrink-0 text-faint transition-colors hover:text-ink">
            <X size={15} />
          </button>
        ) : (
          <span className="ml-auto hidden items-center gap-1 lg:flex">
            <kbd className="rounded-md border border-rule bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-faint">{isMac ? "⌘" : "Ctrl"}</kbd>
            <kbd className="rounded-md border border-rule bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-faint">K</kbd>
          </span>
        )}
      </div>

      {showDropdown ? (
        <div
          id="top-search-list"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 top-full z-40 mt-2 w-full min-w-[19rem] animate-[fade_0.12s_ease-out] overflow-hidden rounded-2xl border border-rule bg-surface shadow-[0_18px_50px_-12px_rgba(10,10,11,0.4)]"
        >
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {loading && results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-mute">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-mute">No matches for &ldquo;{term}&rdquo;.</p>
            ) : (
              results.map((r, i) => {
                const sel = i === activeClamped;
                const Icon = r.type === "page" ? Compass : TYPE_ICON[r.type];
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    id={`top-opt-${i}`}
                    role="option"
                    aria-selected={sel}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.href)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${sel ? "bg-tint-brand" : "hover:bg-bg"}`}
                  >
                    {r.type === "player" ? (
                      <Avatar url={r.avatarUrl ?? null} hue={r.hue ?? 200} name={r.title} size={30} />
                    ) : (
                      <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg ${sel ? "bg-surface text-brand-deep" : "bg-bg text-mute"}`}>
                        <Icon size={15} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                      {r.subtitle ? <span className="block truncate text-xs text-mute">{r.subtitle}</span> : null}
                    </span>
                    <CornerDownLeft size={14} className={`shrink-0 text-faint transition-opacity ${sel ? "opacity-100" : "opacity-0"}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
