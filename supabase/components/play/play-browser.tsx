"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Check, ChevronDown, CircleDot, LayoutGrid, MapPin, MessageCircle, Search, Telescope } from "lucide-react";
import Link from "next/link";
import { SportIcon } from "@/components/sport-icons";
import { SPORT_TONES } from "@/components/sport-chip";
import { SPORTS, sportSlug } from "@/lib/sports";
import { MatchCard } from "./match-card";

/** The Play browse surface — KLIMR-PLAY-HANDOFF. One filter bar on a single
 *  38px baseline (searchable Sport + Court dropdowns with LIVE counts, a When
 *  segmented control with a date popover, an Open-spots toggle), a results
 *  header with sort, and a bounded results well whose height never grows with
 *  match count. Every piece of filter + sort state lives in the URL. */

export type PlayMatch = {
  id: string;
  sportKey: string;
  sportName: string;
  formatLabel: string;
  skillMin: string | null;
  skillMax: string | null;
  effectiveAt: string | null;
  recurrence: string | null;
  courtId: string | null;
  courtName: string | null;
  distanceMi: number | null;
  totalSlots: number;
  joinedCount: number;
  players: { name: string; url: string | null; hue: number }[];
  hostName: string;
  isHost: boolean;
  isJoined: boolean;
  waitlistCount: number;
  /** Viewer's waitlist state on this match, if any. */
  wlStatus: "waitlisted" | "offered" | null;
  wlPosition: number | null;
  wlExpiresAt: string | null;
};
export type CourtOpt = { id: string; name: string; city: string | null; distanceMi: number | null };
export type Viewer = { name: string; hue: number; url: string | null };

type WhenKey = "all" | "today" | "week" | "weekdays" | "weekends" | "date";
const WHEN_SEGMENTS: { key: WhenKey; label: string }[] = [
  { key: "all", label: "All times" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekends", label: "Weekends" },
];

/** Local YYYY-MM-DD (not UTC — after 5 PM Pacific the UTC date is tomorrow). */
const localYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Anytime matches satisfy every window — they're literally "whenever".
 *  `now` is the CLIENT clock, null during SSR/hydration: time filtering
 *  waits for the browser so the server and client render identical trees
 *  (the React #418 hydration flood on /play). */
function inWhen(iso: string | null, when: WhenKey, date: string, now: Date | null): boolean {
  if (!iso || !now) return true;
  const d = new Date(iso);
  if (when === "date" && date) {
    const [y, mo, da] = date.split("-").map(Number);
    return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da;
  }
  if (when === "today") return d.toDateString() === now.toDateString();
  if (when === "week") {
    const end = new Date(now);
    end.setDate(now.getDate() + 7);
    return d.getTime() >= now.getTime() - 2 * 3_600_000 && d <= end;
  }
  if (when === "weekdays") {
    const g = d.getDay();
    return g >= 1 && g <= 5;
  }
  if (when === "weekends") {
    const g = d.getDay();
    return g === 0 || g === 6;
  }
  return true;
}

function dateChipLabel(date: string): string {
  const [y, mo, da] = date.split("-").map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

export function PlayBrowser({ matches, courts, viewer, radiusMi }: { matches: PlayMatch[]; courts: CourtOpt[]; viewer: Viewer; radiusMi: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const sport = sp.get("sport") ?? "";
  const court = sp.get("court") ?? "";
  const date = sp.get("date") ?? "";
  const whenRaw = (sp.get("when") ?? "all") as WhenKey;
  const when: WhenKey = date ? "date" : ["all", "today", "week", "weekdays", "weekends"].includes(whenRaw) ? whenRaw : "all";
  const openUrl = sp.get("open") === "1";
  // Local override so the toggle is instant — the URL round-trip (which
  // keeps the state shareable/back-button-safe) catches up behind it.
  const [openLocal, setOpenLocal] = useState<boolean | null>(null);
  const openOnly = openLocal ?? openUrl;
  useEffect(() => {
    const t = setTimeout(() => setOpenLocal(null), 0); // resync after the URL lands
    return () => clearTimeout(t);
  }, [openUrl]);
  const sort = sp.get("sort") ?? "soon";

  const [menu, setMenu] = useState<null | "sport" | "court" | "date">(null);
  // Client clock — null until mounted (hydration-safe), then ticking.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  const [sportQ, setSportQ] = useState("");
  const [courtQ, setCourtQ] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all" || (k === "sort" && v === "soon")) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`/play${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    if (menu == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // Filters AND-combine; each control's counts recompute against the OTHERS.
  const base = (skip: "sport" | "court" | null) =>
    matches.filter(
      (m) =>
        (skip === "sport" || !sport || m.sportKey === sport) &&
        (skip === "court" || !court || m.courtId === court) &&
        inWhen(m.effectiveAt, when, date, now) &&
        (!openOnly || m.joinedCount < m.totalSlots),
    );

  const sportCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of base("sport")) c.set(m.sportKey, (c.get(m.sportKey) ?? 0) + 1);
    return c;
  }, [matches, court, when, date, openOnly, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const courtCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of base("court")) if (m.courtId) c.set(m.courtId, (c.get(m.courtId) ?? 0) + 1);
    return c;
  }, [matches, sport, when, date, openOnly, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const list = base(null);
    const bySoon = (a: PlayMatch, b: PlayMatch) =>
      (a.effectiveAt ? Date.parse(a.effectiveAt) : Infinity) - (b.effectiveAt ? Date.parse(b.effectiveAt) : Infinity);
    if (sort === "near") list.sort((a, b) => (a.distanceMi ?? 999) - (b.distanceMi ?? 999) || bySoon(a, b));
    else if (sort === "spots")
      list.sort((a, b) => Math.max(0, b.totalSlots - b.joinedCount) - Math.max(0, a.totalSlots - a.joinedCount) || bySoon(a, b));
    else list.sort(bySoon);
    return list;
  }, [matches, sport, court, when, date, openOnly, sort, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSport = SPORTS.find((s) => s.key === sport) ?? null;
  const activeCourt = courts.find((c) => c.id === court) ?? null;
  const sportTone = activeSport ? SPORT_TONES[sportSlug(activeSport.key)] : null;
  const filteredSports = SPORTS.filter((s) => s.name.toLowerCase().includes(sportQ.trim().toLowerCase()));
  const filteredCourts = courts.filter((c) => `${c.name} ${c.city ?? ""}`.toLowerCase().includes(courtQ.trim().toLowerCase()));
  const anyFilter = !!(sport || court || when !== "all" || date || openOnly);

  const trigger =
    "press inline-flex h-[38px] items-center gap-2 rounded-[11px] border px-3 text-[13px] font-bold transition-colors";
  const menuBox =
    "absolute left-0 top-[calc(100%+8px)] z-30 rounded-[14px] border border-rule bg-surface p-2 play-pop";
  const rowCls =
    "press flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-bg";

  return (
    <div className="mt-6">
      <style>{`
        .play-pop { box-shadow: 0 18px 40px -18px rgba(60,44,20,.35); animation: playPop .16s ease; transform-origin: top left; }
        @keyframes playPop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .play-pop { animation: none; } }
        .play-well::-webkit-scrollbar { width: 8px; }
        .play-well::-webkit-scrollbar-thumb { background: #E4DCCB; border-radius: 8px; }
      `}</style>

      {menu ? <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenu(null)} /> : null}

      {/* ── Filter bar — every control on one 38px baseline; wraps under 900px ── */}
      <div className="relative z-30 flex flex-wrap items-center gap-2 rounded-[18px] border border-rule bg-surface px-3.5 py-3 shadow-e1">
        {/* Sport */}
        <div className="relative max-[899px]:w-full">
          <button
            type="button"
            aria-expanded={menu === "sport"}
            aria-haspopup="listbox"
            onClick={() => setMenu(menu === "sport" ? null : "sport")}
            className={`${trigger} max-[899px]:w-full`}
            style={
              sportTone
                ? { background: sportTone.bg, borderColor: sportTone.bd, color: sportTone.fg }
                : { background: "var(--color-surface)", borderColor: "var(--color-rule-2)", color: "var(--color-ink)" }
            }
          >
            <span className="font-mono text-floor font-bold uppercase tracking-[.16em] opacity-60">Sport</span>
            <span className="h-4 w-px bg-current opacity-20" aria-hidden />
            {activeSport ? <SportIcon sport={activeSport.key} variant="glyph" size={17} /> : <LayoutGrid size={15} className="opacity-70" />}
            <span className="max-w-[130px] truncate">{activeSport?.name ?? "All sports"}</span>
            <span className="font-mono text-[10.5px] font-semibold opacity-60">
              {activeSport ? (sportCounts.get(activeSport.key) ?? 0) : base("sport").length}
            </span>
            <ChevronDown size={14} className={`transition-transform ${menu === "sport" ? "rotate-180" : ""}`} />
          </button>
          {menu === "sport" ? (
            <div className={`${menuBox} w-[262px]`} role="listbox" aria-label="Filter by sport">
              <label className="flex items-center gap-2 rounded-[10px] border border-rule bg-bg px-2.5 py-1.5">
                <Search size={13} className="text-faint" />
                <input value={sportQ} onChange={(e) => setSportQ(e.target.value)} placeholder="Filter sports…" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
              </label>
              <div className="mt-1.5 max-h-[246px] overflow-y-auto overscroll-contain">
                <button type="button" role="option" aria-selected={!sport} className={rowCls} onClick={() => { set({ sport: null }); setMenu(null); }}>
                  <LayoutGrid size={16} className="text-mute" />
                  <span className="flex-1">All sports</span>
                  <span className="font-mono text-[10.5px] font-semibold text-faint">{base("sport").length}</span>
                  {!sport ? <Check size={14} className="text-flame-text" /> : null}
                </button>
                {filteredSports.map((s) => {
                  const on = sport === s.key;
                  return (
                    <button key={s.key} type="button" role="option" aria-selected={on} className={`${rowCls} ${on ? "bg-tint-brand" : ""}`} onClick={() => { set({ sport: s.key }); setMenu(null); }}>
                      <SportIcon sport={s.key} variant="glyph" size={17} />
                      <span className="flex-1">{s.name}</span>
                      <span className="font-mono text-[10.5px] font-semibold text-faint">{sportCounts.get(s.key) ?? 0}</span>
                      {on ? <Check size={14} className="text-flame-text" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Court */}
        <div className="relative max-[899px]:w-full">
          <button
            type="button"
            aria-expanded={menu === "court"}
            aria-haspopup="listbox"
            onClick={() => setMenu(menu === "court" ? null : "court")}
            className={`${trigger} border-rule-2 bg-surface text-ink max-[899px]:w-full`}
          >
            <span className="font-mono text-floor font-bold uppercase tracking-[.16em] text-faint">Court</span>
            <span className="h-4 w-px bg-rule" aria-hidden />
            <MapPin size={14} className={activeCourt ? "text-flame-text" : "text-faint"} />
            <span className="max-w-[170px] truncate">{activeCourt?.name ?? "All courts"}</span>
            <span className="font-mono text-[10.5px] font-semibold text-faint">
              {activeCourt ? (courtCounts.get(activeCourt.id) ?? 0) : base("court").length}
            </span>
            <ChevronDown size={14} className={`text-mute transition-transform ${menu === "court" ? "rotate-180" : ""}`} />
          </button>
          {menu === "court" ? (
            <div className={`${menuBox} w-[300px]`} role="listbox" aria-label="Filter by court">
              <label className="flex items-center gap-2 rounded-[10px] border border-rule bg-bg px-2.5 py-1.5">
                <Search size={13} className="text-faint" />
                <input value={courtQ} onChange={(e) => setCourtQ(e.target.value)} placeholder="Search any court — name, city, or ZIP" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
              </label>
              <div className="mt-1.5 max-h-[246px] overflow-y-auto overscroll-contain">
                <button type="button" role="option" aria-selected={!court} className={rowCls} onClick={() => { set({ court: null }); setMenu(null); }}>
                  <span className="min-w-0 flex-1">
                    All courts
                    <span className="mt-0.5 block font-mono text-floor font-semibold uppercase tracking-[.12em] text-faint">Near you</span>
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-faint">{base("court").length}</span>
                  {!court ? <Check size={14} className="text-flame-text" /> : null}
                </button>
                {filteredCourts.map((c) => {
                  const on = court === c.id;
                  return (
                    <button key={c.id} type="button" role="option" aria-selected={on} className={`${rowCls} ${on ? "bg-tint-brand" : ""}`} onClick={() => { set({ court: c.id }); setMenu(null); }}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.name}</span>
                        <span className="mt-0.5 block font-mono text-floor font-semibold uppercase tracking-[.12em] text-faint">
                          {[c.city, c.distanceMi != null ? `${c.distanceMi.toFixed(1)} MI` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="font-mono text-[10.5px] font-semibold text-faint">{courtCounts.get(c.id) ?? 0}</span>
                      {on ? <Check size={14} className="text-flame-text" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* When */}
        <div className="flex items-center gap-2 max-[899px]:w-full max-[899px]:overflow-x-auto">
          <span className="font-mono text-floor font-bold uppercase tracking-[.16em] text-faint">When</span>
          <div className="flex items-center rounded-[11px] p-[3px]" style={{ background: "rgba(32,27,18,.05)" }}>
            {WHEN_SEGMENTS.map((w) => {
              const on = when === w.key;
              return (
                <button
                  key={w.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ when: w.key === "all" ? null : w.key, date: null })}
                  className="press h-[30px] whitespace-nowrap rounded-[9px] px-3 text-[12.5px] font-semibold transition-colors"
                  style={on ? { background: "#fff", border: "1px solid var(--color-rule-2)", boxShadow: "0 1px 2px rgba(80,60,30,.1)", color: "var(--color-ink)" } : { color: "var(--color-mute)" }}
                >
                  {w.label}
                </button>
              );
            })}
            <div className="relative">
              <button
                type="button"
                aria-expanded={menu === "date"}
                onClick={() => setMenu(menu === "date" ? null : "date")}
                className="press flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[12.5px] font-semibold transition-colors"
                style={
                  date
                    ? { background: "var(--color-tint-brand)", border: "1px solid var(--color-tint-brand-bd)", color: "var(--color-flame-text)" }
                    : { color: "var(--color-mute)" }
                }
              >
                <Calendar size={13} />
                {date ? <span className="font-mono text-[11px] font-bold tracking-[.04em]">{dateChipLabel(date)}</span> : "Choose a date"}
                <ChevronDown size={13} className={`transition-transform ${menu === "date" ? "rotate-180" : ""}`} />
              </button>
              {menu === "date" ? (
                <div className={`${menuBox} right-0 left-auto w-[238px]`}>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    min={now ? localYMD(now) : undefined}
                    onChange={(e) => set({ date: e.target.value || null, when: null })}
                    aria-label="Show matches on a date"
                    className="w-full rounded-[10px] border border-rule bg-bg px-2.5 py-2 font-mono text-[13px] text-ink outline-none focus:border-brand"
                  />
                  {date ? (
                    <button type="button" className="press mt-1.5 w-full rounded-[10px] border border-rule px-2.5 py-1.5 text-[12.5px] font-semibold text-mute hover:text-ink" onClick={() => { set({ date: null }); setMenu(null); }}>
                      Clear date
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <span className="flex-1" aria-hidden />

        <button
          type="button"
          aria-pressed={openOnly}
          onClick={() => {
            setOpenLocal(!openOnly);
            set({ open: openOnly ? null : "1" });
          }}
          className={`${trigger} max-[899px]:w-full`}
          style={
            openOnly
              ? { background: "var(--color-tint-brand)", borderColor: "var(--color-tint-brand-bd)", color: "var(--color-flame-text)" }
              : { background: "var(--color-surface)", borderColor: "var(--color-rule-2)", color: "var(--color-mute)" }
          }
        >
          <CircleDot size={14} /> Open spots only
        </button>
      </div>

      {/* ── Results header ── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-faint">
          {results.length} open match{results.length === 1 ? "" : "es"} near you · Within {radiusMi} mi
        </p>
        <label className="flex items-center gap-2">
          <span className="font-mono text-floor font-bold uppercase tracking-[.16em] text-faint">Sort</span>
          <select
            value={sort}
            onChange={(e) => set({ sort: e.target.value })}
            className="h-8 rounded-[10px] border border-rule-2 bg-surface px-2 text-[12.5px] font-semibold text-ink outline-none focus:border-brand"
          >
            <option value="soon">Soonest first</option>
            <option value="near">Nearest first</option>
            <option value="spots">Most open spots</option>
          </select>
        </label>
      </div>

      {/* ── Results well — the page's height never grows with match count ── */}
      <div className="play-well mt-3 overflow-y-auto overscroll-contain rounded-[18px] border p-3 max-[899px]:max-h-[70vh]" style={{ maxHeight: 600, borderColor: "#EFE9DC", background: "#FDFBF7" }}>
        {results.length === 0 ? (
          <div className="grid min-h-[420px] place-items-center text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] border border-rule bg-surface text-mute shadow-e1">
                <Telescope size={24} />
              </span>
              <p className="mt-4 font-display text-[17px] font-bold text-ink">No open matches here yet.</p>
              <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-relaxed text-mute">
                Widen the filters — or be the one who puts a match on the board.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                {anyFilter ? (
                  <button type="button" onClick={() => router.replace("/play", { scroll: false })} className="press h-9 rounded-[10px] border border-rule bg-surface px-3.5 text-[13px] font-bold text-ink-soft hover:text-ink">
                    Clear filters
                  </button>
                ) : null}
                <Link href="/play/new" className="press inline-flex h-9 items-center rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                  Organize a match
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
            {results.map((m) => (
              <MatchCard key={m.id} m={m} viewer={viewer} now={now} />
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-faint">
        <MessageCircle size={13} /> Joining a match opens its chat automatically. Ranked scoring happens in the match room after you play.
      </p>
    </div>
  );
}
