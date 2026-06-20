"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, MapPin, Users, CalendarDays, Plus, Trophy, CornerDownLeft, Loader2 } from "lucide-react";
import { globalSearch } from "@/app/search/actions";
import type { SearchResult, SearchResultType } from "@/app/search/types";
import { Avatar } from "@/components/avatar";

const TYPE_ICON: Record<SearchResultType, typeof User> = {
  player: User,
  court: MapPin,
  team: Users,
  event: CalendarDays,
};
const TYPE_LABEL: Record<SearchResultType, string> = {
  player: "Player",
  court: "Court",
  team: "Team",
  event: "Event",
};

type QuickAction = { label: string; href: string; Icon: typeof Plus };
const QUICK_ACTIONS: QuickAction[] = [
  { label: "Organize a match", href: "/play/new", Icon: Plus },
  { label: "Find courts near you", href: "/courts", Icon: MapPin },
  { label: "Browse players", href: "/network", Icon: Users },
  { label: "View rankings", href: "/rankings", Icon: Trophy },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
  }, []);

  // Opened only by the mobile search icon (custom event). Desktop uses the
  // inline TopSearch with its own ⌘K handling, so this dialog has no shortcut.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("klimr:open-search", onOpen);
    return () => {
      window.removeEventListener("klimr:open-search", onOpen);
    };
  }, []);

  // Focus the input on open and lock background scroll while the dialog is up.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 20);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(id);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Debounced search. All state updates happen inside the timeout callback
  // (never synchronously in the effect body).
  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (q.length < 2) {
          if (id === reqId.current) {
            setResults([]);
            setActive(0);
            setLoading(false);
          }
          return;
        }
        if (id === reqId.current) setLoading(true);
        const r = await globalSearch(q);
        if (id === reqId.current) {
          setResults(r);
          setActive(0);
          setLoading(false);
        }
      },
      q.length < 2 ? 0 : 180,
    );
    return () => clearTimeout(t);
  }, [query]);

  const showingActions = query.trim().length < 2;
  const navItems: { href: string }[] = showingActions ? QUICK_ACTIONS : results;
  const activeClamped = navItems.length ? Math.min(active, navItems.length - 1) : 0;
  const activeId = navItems.length ? `cmd-opt-${activeClamped}` : undefined;

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`cmd-opt-${activeClamped}`)?.scrollIntoView({ block: "nearest" });
  }, [activeClamped, open, showingActions]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Trap focus on the input — navigation is via arrows, selection via Enter.
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(navItems.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = navItems[activeClamped];
      if (item) go(item.href);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search Klimr"
      onMouseDown={close}
    >
      <div className="absolute inset-0 animate-[fade_0.18s_ease-out] bg-ink/30 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-xl animate-[rise_0.18s_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-2xl border border-rule bg-surface shadow-[0_30px_80px_-20px_rgba(10,10,11,0.5)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <Search size={18} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search players, courts, teams, events…"
            className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-faint"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls="cmd-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
          />
          {loading ? <Loader2 size={16} className="shrink-0 animate-spin text-faint" /> : null}
          <kbd className="hidden shrink-0 rounded-md border border-rule bg-bg px-1.5 py-0.5 text-[11px] font-semibold text-faint sm:block">esc</kbd>
        </div>

        <div id="cmd-listbox" role="listbox" aria-label="Search results" className="max-h-[52vh] overflow-y-auto p-2">
          {showingActions ? (
            <>
              <p className="kicker px-2.5 pb-1 pt-2 text-faint">Quick actions</p>
              {QUICK_ACTIONS.map((a, i) => {
                const sel = i === activeClamped;
                return (
                  <button
                    key={a.href}
                    id={`cmd-opt-${i}`}
                    role="option"
                    aria-selected={sel}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(a.href)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold transition-colors ${sel ? "bg-tint-brand text-brand-deep" : "text-ink"}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${sel ? "bg-surface text-brand-deep" : "bg-[#f4f4f5] text-mute"}`}>
                      <a.Icon size={16} />
                    </span>
                    {a.label}
                  </button>
                );
              })}
            </>
          ) : results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-mute">{loading ? "Searching…" : `No matches for “${query.trim()}”.`}</p>
          ) : (
            results.map((r, i) => {
              const sel = i === activeClamped;
              const Icon = TYPE_ICON[r.type];
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  id={`cmd-opt-${i}`}
                  role="option"
                  aria-selected={sel}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${sel ? "bg-tint-brand" : ""}`}
                >
                  {r.type === "player" ? (
                    <Avatar url={r.avatarUrl ?? null} hue={r.hue ?? 200} name={r.title} size={32} />
                  ) : (
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${sel ? "bg-surface text-brand-deep" : "bg-[#f4f4f5] text-mute"}`}>
                      <Icon size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                    {r.subtitle ? <span className="block truncate text-xs text-mute">{r.subtitle}</span> : null}
                  </span>
                  <span className="shrink-0 rounded-md bg-[#f4f4f5] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{TYPE_LABEL[r.type]}</span>
                  <CornerDownLeft size={14} className={`shrink-0 text-faint transition-opacity ${sel ? "opacity-100" : "opacity-0"}`} />
                </button>
              );
            })
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-rule bg-bg/60 px-4 py-2 text-[11px] text-faint sm:flex">
          <span className="flex items-center gap-1"><kbd className="rounded border border-rule bg-surface px-1 font-semibold">↑</kbd><kbd className="rounded border border-rule bg-surface px-1 font-semibold">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-rule bg-surface px-1 font-semibold">↵</kbd> open</span>
          <span className="ml-auto flex items-center gap-1"><kbd className="rounded border border-rule bg-surface px-1 font-semibold">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
