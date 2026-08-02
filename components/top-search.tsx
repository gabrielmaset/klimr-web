"use client";

import { SITE_INDEX, type PageSection } from "@/lib/site-index";
import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, User, MapPin, Users, CalendarDays, Loader2, CornerDownLeft, X, Trophy, ShoppingBag, GraduationCap , ArrowUpRight } from "lucide-react";
import { globalSearch } from "@/app/search/actions";
import { useAiSearch } from "@/components/ai-search-panel";
import type { SearchResult, SearchResultType } from "@/app/search/types";
import { Compass } from "lucide-react";

type PageResult = { type: "page"; id: string; title: string; subtitle?: string; href: string; section: PageSection };
type Result = SearchResult | PageResult;

// ONE source of truth (lib/site-index.ts): a page added there is instantly
// findable here, in the AI's find_pages tool, everywhere. The hand list that
// forgot Live Queue is dead.
const PAGES: PageResult[] = SITE_INDEX.map((e) => ({
  type: "page",
  id: e.href.replace(/^\//, "").replace(/\//g, "-") || "home",
  title: e.title,
  subtitle: e.description,
  href: e.href,
  section: e.section,
}));
const SITE_BY_HREF = new Map(SITE_INDEX.map((e) => [e.href, e]));
// WORD-based matching only: a keyword matches when a typed WORD starts with
// it (or vice versa, >=3 chars) — never via free substring, which once made
// "name" match inside "tournaMEnts".
const wordMatch = (qWords: string[], k: string) => {
  const kws = k.toLowerCase().split(/\s+/);
  return kws.every((kw) => qWords.some((w) => w.startsWith(kw) || (kw.length >= 3 && kw.startsWith(w) && w.length >= 3)));
};
const pageHits = (qRaw: string) => {
  const q = qRaw.toLowerCase();
  const qWords = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return PAGES.filter((pg) => {
    const title = pg.title.toLowerCase();
    if (title.includes(q) || qWords.some((w) => w.length >= 3 && title.includes(w))) return true;
    const entry = SITE_BY_HREF.get(pg.href);
    return !!entry && entry.keywords.some((k) => wordMatch(qWords, k));
  }).slice(0, 5);
};

// Section grouping — deterministic by source type (the industry pattern for
// typeahead: Linear/GitHub/Notion group by KIND, never by AI classification —
// instant, stable, and every result already knows its type). Fixed order,
// per-section caps; the keyboard walks the flattened list.
const pageSec = (k: PageSection) => (r: Result) => r.type === "page" && r.section === k;
const SECTION_ORDER: { key: string; label: string; max: number; pick: (r: Result) => boolean }[] = [
  { key: "primary", label: "Navigate", max: 3, pick: pageSec("primary") },
  { key: "compete", label: "Compete", max: 3, pick: pageSec("compete") },
  { key: "community", label: "Community", max: 3, pick: pageSec("community") },
  { key: "discover", label: "Discover", max: 4, pick: pageSec("discover") },
  { key: "account", label: "Settings & account", max: 3, pick: pageSec("account") },
  { key: "player", label: "Players", max: 5, pick: (r) => r.type === "player" },
  { key: "court", label: "Courts", max: 5, pick: (r) => r.type === "court" },
  { key: "team", label: "Teams", max: 4, pick: (r) => r.type === "team" },
  { key: "event", label: "Events", max: 4, pick: (r) => r.type === "event" },
  { key: "tournament", label: "Tournaments", max: 4, pick: (r) => r.type === "tournament" },
  { key: "listing", label: "Marketplace", max: 4, pick: (r) => r.type === "listing" },
  { key: "class", label: "Classes & coaching", max: 3, pick: (r) => r.type === "class" },
];
function sectionize(results: Result[]) {
  const used = new Set<Result>();
  const sections = SECTION_ORDER.map((s) => {
    const items = results.filter((r) => !used.has(r) && s.pick(r)).slice(0, s.max);
    for (const r of items) used.add(r);
    return { key: s.key, label: s.label, items };
  }).filter((s) => s.items.length > 0);
  // Anything a future type adds falls into a visible catch-all, never vanishes.
  const rest = results.filter((r) => !used.has(r)).slice(0, 4);
  if (rest.length) sections.push({ key: "other", label: "More", items: rest });
  return { sections, flat: sections.flatMap((s) => s.items) };
}
import { Avatar } from "@/components/avatar";

const TYPE_ICON: Record<SearchResultType, typeof User> = {
  player: User,
  court: MapPin,
  team: Users,
  event: CalendarDays,
  tournament: Trophy,
  listing: ShoppingBag,
  class: GraduationCap,
};

function TopSearchInner() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [settledFor, setSettledFor] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  const { ai, runAi } = useAiSearch();

  const term = query.trim();
  const hasQuery = term.length >= 2;
  const showDropdown = open && hasQuery;
  const aiActive = ai.state !== "idle" && ai.query === term;
  // AI results merge only what's NOVEL: anything whose href the
  // deterministic layer already shows is dropped (the duplicate-Events fix).
  const aiGroups = useMemo(() => {
    if (!(ai.state === "done" && ai.query === term && ai.result)) return [];
    const seen = new Set<string>([...results.map((r) => r.href ?? ""), ...pageHits(term).map((p) => p.href)]);
    return ai.result.groups
      .map((g) => ({ ...g, items: g.items.filter((it) => !seen.has(it.href)) }))
      .filter((g) => g.items.length > 0);
  }, [ai.state, ai.query, ai.result, results, term]);
  // Natural-language queries auto-run the AI (debounced) — no button, no
  // separate panel: its groups merge into the dropdown as ordinary sections.
  const looksNatural = useMemo(() => {
    const w = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return term.includes("?") || w.length >= 3;
  }, [term]);
  useEffect(() => {
    if (!open || !looksNatural || term.length < 6) return;
    if (ai.state !== "idle" && ai.query === term) return;
    const h = setTimeout(() => runAi(term), 700);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, open, looksNatural]);
  const { sections, flat } = sectionize(results);
  const activeClamped = flat.length ? Math.min(active, flat.length - 1) : 0;

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
            setSettledFor(term);
          }
          return;
        }
        if (id === reqId.current) setLoading(true);
        const r = await globalSearch(term);
        if (id === reqId.current) {
          setResults([...pageHits(term), ...r]);
          setActive(0);
          setLoading(false);
          setSettledFor(term);
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
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runAi(term);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[activeClamped];
      if (item) go(item.href);
    }
  }

  return (
    <div ref={wrapRef} className="relative min-w-[120px] max-w-[435px] flex-[1_1_270px]">
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
          placeholder="Search or ask Klimr AI — players, courts, anything…"
          className="h-full w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="top-search-list"
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && flat.length ? `top-opt-${activeClamped}` : undefined}
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
            {aiActive && ai.state === "loading" ? (
              <p className="flex items-center gap-2 px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-faint">
                <Loader2 size={11} className="animate-spin" /> Searching…
              </p>
            ) : null}
            {aiActive && ai.state === "done" && ai.result ? (
              <div className="mb-1">
                {ai.result.steps?.length ? (
                  <ol className="mx-1 mb-2 space-y-1 rounded-xl border border-rule-soft bg-bg px-3.5 py-3">
                    {ai.result.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
                        <span className="font-mono text-[11px] font-bold text-brand">{i + 1}.</span> {s}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {aiGroups.map((g) => (
                  <div key={g.kind + g.label}>
                    <p className="kicker px-2.5 pb-1 pt-1.5 text-faint">{g.label}</p>
                    {g.items.map((item) => (
                      <button
                        key={item.href + item.title}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(item.href)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-tint-brand"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                          {item.subtitle || item.meta ? (
                            <span className="block truncate text-xs text-mute">{[item.subtitle, item.meta].filter(Boolean).join(" · ")}</span>
                          ) : null}
                        </span>
                        <ArrowUpRight size={14} className="shrink-0 text-faint" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {loading && results.length === 0 && !aiActive ? (
              <p className="px-3 py-8 text-center text-sm text-mute">Searching…</p>
            ) : flat.length === 0 && settledFor === term && !(aiActive && (ai.state === "done" || ai.state === "loading")) ? (
              <p className="px-3 py-8 text-center text-sm text-mute">No matches for &ldquo;{term}&rdquo;.</p>
            ) : (
              sections.map((section, si) => (
                <div key={section.key}>
                  <p className={`kicker px-2.5 pb-1 ${si === 0 ? "pt-1.5" : "pt-3"} text-faint`}>{section.label}</p>
                  {section.items.map((r) => {
                    const i = flat.indexOf(r);
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
              })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Navigation clears the query (Gabriel's spec): remounting by pathname
 *  resets term + AI state with zero effects — refreshes land on an already
 *  fresh mount, so nothing is lost there either. */
export function TopSearch() {
  const pathname = usePathname();
  return <TopSearchInner key={pathname} />;
}
