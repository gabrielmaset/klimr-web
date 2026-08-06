"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { MapPin, LocateFixed, Search, Globe, Sun, Warehouse, Lightbulb, Tag, Star, Navigation, ArrowRight, ChevronDown, Check, Plus, ShieldCheck, List, Map as MapIcon, Loader2,  } from "lucide-react";
import { SPORTS } from "@/lib/sports";
import { SportIcon } from "@/components/sport-icons";
import { CourtsMap } from "./courts-map";
import type { SearchResponse } from "./search-actions";
import { reverseToZip } from "./search-actions";

export type FinderCourt = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  sports: string[];
  courtCount: number | null;
  indoor: boolean;
  lights: boolean | null;
  free: boolean | null;
  memberRating: number | null;
  memberReviewCount: number;
  googleRating: number | null;
  googleRatingCount: number;
  liveQueue: boolean;
  activePlayers: number;
  recent: { id: string; name: string; hue: number }[];
  busy: "BUSY" | "MODERATE" | "QUIET" | null;
  distanceMi: number;
};

/** Finder rows = confirmed directory courts + live-found Google results (the
 *  "on Google but not on Klimr yet" layer — the Westwood fix). */
type Row = FinderCourt & { liveFound?: boolean; website?: string | null; isPrivate?: boolean; verified?: boolean; listedUnverified?: boolean; venueKnown?: boolean };

type Filters = {
  zip: string;
  /** Precise "lat,lng" from Use-my-location — beats the ZIP-centroid snap. */
  ll: string;
  radius: number;
  sport: string;
  venue: "any" | "outdoor" | "indoor";
  lights: boolean;
  free: boolean;
  queue: boolean;
  sort: "nearest" | "active" | "rated" | "courts";
};

const RADII = [3, 5, 10, 25];
const BUSY_STYLE: Record<string, string> = {
  BUSY: "bg-[#FDECEC] text-[#B42318]",
  MODERATE: "bg-[#FDF3DD] text-[#B45309]",
  QUIET: "bg-[#EAF6EC] text-[#217A34]",
};
const disc = (h: number) => `linear-gradient(145deg, hsl(${h},70%,52%), hsl(${(h + 24) % 360},66%,42%))`;
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "K";

export function CourtsFinder({
  initial,
  courts,
  origin,
  originLabel,
  liveQueuesNow,
  scanKicked = false,
  availableSports,
  mapboxToken,
}: {
  initial: Filters;
  courts: FinderCourt[];
  origin: { lat: number; lng: number } | null;
  originLabel: string;
  liveQueuesNow: number;
  scanKicked?: boolean;
  availableSports?: string[];
  mapboxToken: string | null;
}) {
  const router = useRouter();
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (!scanKicked || refreshedRef.current) return;
    refreshedRef.current = true;
    const t = setTimeout(() => router.refresh(), 8000);
    return () => clearTimeout(t);
  }, [scanKicked, router]);
  const pathname = usePathname();
  const [zipDraft, setZipDraft] = useState(initial.zip);
  const spq = useSearchParams();
  const f = useMemo<Filters>(() => {
    const g = (k: string) => spq.get(k) ?? "";
    const radius = Number(g("radius"));
    return {
      zip: g("zip") || initial.zip,
      ll: /^-?\d+\.\d+,-?\d+\.\d+$/.test(g("ll")) ? g("ll") : "",
      radius: [3, 5, 10, 25].includes(radius) ? radius : initial.radius,
      sport: g("sport") || initial.sport,
      venue: g("venue") === "indoor" || g("venue") === "outdoor" ? (g("venue") as "indoor" | "outdoor") : initial.venue,
      lights: g("lights") ? g("lights") === "1" : initial.lights,
      free: g("free") ? g("free") === "1" : initial.free,
      queue: g("queue") ? g("queue") === "1" : initial.queue,
      sort: ["active", "rated", "courts"].includes(g("sort")) ? (g("sort") as Filters["sort"]) : initial.sort,
    };
  }, [spq, initial]);
  const [sportOpen, setSportOpen] = useState(false);
  const [sportQuery, setSportQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pane, setPane] = useState<"list" | "map">("list");
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // URL is canonical: origin/radius changes reload the data server-side;
  // everything else narrows client-side but still lands in the URL.
  const pushUrl = (next: Filters, reload: boolean) => {
    setSelectedId(null); // spec: any filter/sort change clears the selection
    const q = new URLSearchParams();
    if (next.zip) q.set("zip", next.zip);
    if (next.ll) q.set("ll", next.ll);
    if (next.radius !== 10) q.set("radius", String(next.radius));
    if (next.sport !== "all") q.set("sport", next.sport);
    if (next.venue !== "any") q.set("venue", next.venue);
    if (next.lights) q.set("lights", "1");
    if (next.free) q.set("free", "1");
    if (next.queue) q.set("queue", "1");
    if (next.sort !== "nearest") q.set("sort", next.sort);
    const url = `${pathname}?${q.toString()}`;
    if (reload) startTransition(() => router.push(url, { scroll: false }));
    else window.history.replaceState(null, "", url);
  };
  /* Live discovery — the SAME Google→screening pipeline the match court
     picker uses, so this page finally searches the world, not just the
     directory. Directory rows stay the confirmed layer; live rows arrive
     flagged as unconfirmed. */
  const [live, setLive] = useState<SearchResponse | null>(null);
  const [liveBusy, startLiveT] = useTransition();
  // Searches run ONLY on the Find courts click (or a deep link's first
  // load). Filter changes — radius, sport, venue, location — just compose
  // the next query and re-arm the button; nothing fires until it's pressed.
  const liveSeq = useRef(0);
  const searchKeyOf = (x: Filters) => [x.zip, x.ll, x.radius, x.sport, x.venue, x.lights, x.free].join("|");
  const [searchedKey, setSearchedKey] = useState<string | null>(null);
  const runSearch = (target: Filters) => {
    const seq = ++liveSeq.current;
    const key = searchKeyOf(target);
    startLiveT(async () => {
      if (!target.zip || target.sport === "all") {
        setLive(null);
        setSearchedKey(key);
        return;
      }
      const m = /^(-?\d+\.\d+),(-?\d+\.\d+)$/.exec(target.ll);
      try {
        // Route-handler fetch, NOT a server action: navigation never queues
        // behind a running search — the menu stays instant regardless.
        const r = (await Promise.race([
          fetch("/api/courts/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locationKey: target.zip,
              radiusKm: Math.max(2, Math.round(target.radius * 1.609)),
              sport: target.sport,
              ...(m ? { lat: Number(m[1]), lng: Number(m[2]) } : {}),
            }),
          }).then((res) => res.json()),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 40000)),
        ])) as SearchResponse;
        if (liveSeq.current === seq) {
          setLive(r);
          setSearchedKey(key); // grey the button: this exact query is answered
        }
      } catch {
        if (liveSeq.current === seq) {
          setLive({ status: "error", courts: [], source: "none", message: "Live search timed out — try again." });
        }
      }
    });
  };
  // Deep links (?zip=…&sport=…) search once on arrival — that's the point of
  // a shared link; everything after is button-driven.
  useEffect(() => {
    if (f.zip && f.sport !== "all") runSearch(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<Filters>, reload = false) => {
    pushUrl({ ...f, ...patch }, reload);
  };

  const intendedFilters = (): Filters => {
    const z = zipDraft.trim();
    // Typing a different place drops the precise coordinates; clicking Find
    // with the same ZIP (e.g. right after Use-my-location) keeps them.
    return { ...f, zip: z, ll: z === f.zip ? f.ll : "" };
  };
  const findCourts = () => {
    const next = intendedFilters();
    pushUrl(next, true);
    runSearch(next);
  };
  /** Orange = this exact query hasn't been run yet; grey = answered. */
  const searchDirty = searchedKey !== searchKeyOf(intendedFilters());
  const useMyLocation = () => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    // High-accuracy fix, and the EXACT coordinates become the origin — the
    // old flow snapped to the nearest ZIP's centroid, which in a big ZIP put
    // "your location" a mile away. The ZIP is now display + cache only.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ll = `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
        const { zip } = await reverseToZip({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        if (zip) setZipDraft(zip);
        set({ zip: zip ?? f.zip, ll }, true);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  // ── Client-side narrowing over the radius set ──────────────────────────────
  const lightsOn = f.lights || f.venue === "indoor";
  const passesNonSport = (c: FinderCourt) =>
    (f.venue === "any" || (f.venue === "indoor" ? c.indoor : !c.indoor)) &&
    (!lightsOn || c.lights === true) &&
    (!f.free || c.free === true) &&
    (!f.queue || c.liveQueue);

  const visible = useMemo(() => {
    const rows = courts.filter((c) => passesNonSport(c) && (f.sport === "all" || c.sports.includes(f.sport)));
    const by: Record<Filters["sort"], (a: FinderCourt, b: FinderCourt) => number> = {
      nearest: (a, b) => a.distanceMi - b.distanceMi,
      active: (a, b) => b.activePlayers - a.activePlayers || a.distanceMi - b.distanceMi,
      rated: (a, b) => ((b.memberRating ?? b.googleRating ?? -1) - (a.memberRating ?? a.googleRating ?? -1)) || a.distanceMi - b.distanceMi,
      courts: (a, b) => (b.courtCount ?? 0) - (a.courtCount ?? 0) || a.distanceMi - b.distanceMi,
    };
    return [...rows].sort(by[f.sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courts, f]);

  const liveRows = useMemo<Row[]>(() => {
    if (!live || live.status !== "ok") return [];
    const dirNames = new Set(courts.map((c) => c.name.toLowerCase().trim()));
    return live.courts
      // Belt to the engine's hard bound: nothing beyond the chosen radius,
      // even if a cached row from another setting ever slipped through.
      .filter((r) => r.distanceKm * 0.6214 <= f.radius + 0.05)
      .filter((r) => !dirNames.has(r.name.toLowerCase().trim()))
      .map((r) => ({
        id: `g:${r.id}`,
        name: r.name,
        area: r.address ?? "",
        lat: r.lat,
        lng: r.lng,
        sports: [r.sport],
        courtCount: null,
        indoor: false,
        lights: null,
        free: null,
        memberRating: null,
        memberReviewCount: 0,
        googleRating: r.rating,
        googleRatingCount: r.ratingCount ?? 0,
        liveQueue: false,
        activePlayers: 0,
        recent: [],
        busy: null,
        distanceMi: Math.round(r.distanceKm * 0.6214 * 10) / 10,
        liveFound: true,
        venueKnown: false, // Google doesn\u2019t say indoor/outdoor \u2014 claim nothing
        website: r.website,
        isPrivate: r.private,
        verified: r.verified === true,
        listedUnverified: r.listedUnverified === true,
      }));
  }, [live, courts, f.radius]);
  const shown = useMemo<Row[]>(() => [...visible, ...liveRows], [visible, liveRows]);

  // Derived, not synced: a selection only counts while its court is visible —
  // any filter change that removes the row clears the selection for free.
  const effectiveSelectedId = selectedId !== null && shown.some((c) => c.id === selectedId) ? selectedId : null;

  const selectFromMap = (id: string) => {
    setSelectedId(id);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-court="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const sportName = f.sport === "all" ? "All sports" : SPORTS.find((s) => s.key === f.sport)?.name ?? f.sport;
  const scopedSports = availableSports?.length ? SPORTS.filter((s) => availableSports.includes(s.key)) : SPORTS;
  const filteredSports = scopedSports.filter((s) => s.name.toLowerCase().includes(sportQuery.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Discover — Courts</p>
          <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Courts</h1>
          <p className="mt-1 text-sm text-mute">Real, playable places — screened by Klimr, ranked by how busy they actually are.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {liveQueuesNow > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#EAF6EC] px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.12em] text-[#217A34]">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2FA44F]" /> {liveQueuesNow} LIVE {liveQueuesNow === 1 ? "QUEUE" : "QUEUES"} NOW
            </span>
          ) : null}
          <Link
            href="/courts/suggest"
            className="press inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-hover"
          >
            <Plus size={14} /> Suggest a court
          </Link>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-rule bg-surface p-3.5 shadow-e1">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-[11px] border border-rule-2 bg-ink/[0.03] px-3.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
            <MapPin size={15} className="shrink-0 text-brand-deep" />
            <input
              value={zipDraft}
              onChange={(e) => setZipDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") findCourts();
              }}
              placeholder="ZIP or city"
              aria-label="ZIP or city"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-bold tracking-wide text-ink outline-none placeholder:font-medium placeholder:text-faint"
            />
            <button
              type="button"
              onClick={useMyLocation}
              className="press hidden shrink-0 items-center gap-1.5 rounded-[9px] border border-rule-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-mute hover:text-ink sm:inline-flex"
            >
              <LocateFixed size={12} className={locating ? "animate-spin" : ""} /> Use my location
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-floor font-semibold tracking-[0.14em] text-faint md:inline">WITHIN</span>
            <div className="inline-flex gap-0.5 rounded-[11px] bg-ink/5 p-[3px]">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ radius: r }, true)}
                  className={`press h-8 rounded-lg border px-3 font-mono text-[11px] font-bold transition-colors ${
                    f.radius === r ? "border-rule-2 bg-surface text-ink shadow-[0_1px_2px_rgba(80,60,30,.08)]" : "border-transparent text-mute hover:text-ink"
                  }`}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </div>
          {/* This button owns the LIVE search, so every visual state on it is
              driven by liveBusy. It must NOT react to `pending`: that flag is
              the router.push transition, which fires whenever the radius (or
              any reload filter) changes. Wiring the spinner to `pending` made
              a radius change look like a search had started when none had —
              the button spun, "SEARCHING" appeared, and nothing ran. Staying
              enabled during `pending` is deliberate too: the user just changed
              a filter and wants to search now, and findCourts() recomputes
              from intendedFilters() anyway. */}
          <button
            type="button"
            onClick={findCourts}
            disabled={liveBusy}
            className={`press inline-flex h-11 items-center gap-2 rounded-[11px] px-5 text-sm font-bold ${
              searchDirty || liveBusy
                ? "bg-brand text-white shadow-[0_4px_14px_-6px_rgba(214,58,15,.5)] hover:bg-[#E23E0D]"
                : "bg-[#DDD7CA] text-[#6E6759] hover:bg-[#D3CCBD]"
            }`}
          >
            {liveBusy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find courts
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-rule-soft pt-3">
          {/* Sport dropdown — searchable, scales to any roster */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <span className="mr-1.5 font-mono text-floor font-semibold uppercase tracking-[0.16em] text-faint">Sport</span>
            <button
              type="button"
              onClick={() => {
                setSportOpen((o) => !o);
                setSportQuery("");
              }}
              aria-haspopup="listbox"
              aria-expanded={sportOpen}
              className="press inline-flex h-[34px] items-center gap-2 rounded-[10px] border border-[#DCEBC0] bg-[#F1F8E3] px-3 text-[12.5px] font-bold text-[#4D7C0F]"
            >
              {f.sport !== "all" ? <SportIcon sport={f.sport} variant="glyph" size={14} /> : <Globe size={13} />}
              {sportName}
              <ChevronDown size={13} />
            </button>
            {sportOpen ? (
              <div role="listbox" className="absolute left-0 top-11 z-30 w-64 rounded-xl border border-rule-2 bg-surface p-1.5 shadow-e3">
                <input
                  
                  value={sportQuery}
                  onChange={(e) => setSportQuery(e.target.value)}
                  placeholder="Search sports…"
                  className="mb-1 h-8 w-full rounded-[9px] border border-rule-2 bg-ink/[0.03] px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
                />
                <button
                  type="button"
                  role="option"
                  aria-selected={f.sport === "all"}
                  onClick={() => {
                    set({ sport: "all" });
                    setSportOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-hover"
                >
                  <Globe size={14} className="text-mute" /> All sports
                  {f.sport === "all" ? <Check size={13} className="text-brand-deep" /> : null}
                </button>
                <div className="max-h-56 overflow-y-auto">
                  {filteredSports.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      role="option"
                      aria-selected={f.sport === s.key}
                      onClick={() => {
                        set({ sport: s.key });
                        setSportOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-hover"
                    >
                      <SportIcon sport={s.key} variant="glyph" size={15} /> {s.name}
                      {f.sport === s.key ? <Check size={13} className="text-brand-deep" /> : null}
                    </button>
                  ))}
                  {filteredSports.length === 0 ? <p className="px-2.5 py-2 text-xs text-faint">No sport matches.</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Venue */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-floor font-semibold uppercase tracking-[0.16em] text-faint">Venue</span>
            <div className="inline-flex gap-0.5 rounded-[11px] bg-ink/5 p-[3px]">
              {(
                [
                  { key: "any", label: "Any", Icon: Globe },
                  { key: "outdoor", label: "Outdoor", Icon: Sun },
                  { key: "indoor", label: "Indoor", Icon: Warehouse },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set({ venue: key })}
                  className={`press inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                    f.venue === key ? "border-rule-2 bg-surface text-ink shadow-[0_1px_2px_rgba(80,60,30,.08)]" : "border-transparent text-mute hover:text-ink"
                  }`}
                >
                  <Icon size={12.5} /> {label}
                </button>
              ))}
            </div>
          </div>

          <span className="flex-1" />

          {/* Amenities */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: "lights" as const, label: "Lights", Icon: Lightbulb, on: lightsOn, auto: f.venue === "indoor" && !f.lights },
                { key: "free" as const, label: "Free", Icon: Tag, on: f.free, auto: false },
              ]
            ).map(({ key, label, Icon, on, auto }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "lights" && f.venue === "indoor") return; // implied
                  set({ [key]: !f[key] } as Partial<Filters>);
                }}
                className={`press inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors ${
                  on ? "border-[#FFD4BC] bg-tint-brand text-brand-deep" : "border-rule-2 bg-surface text-mute hover:border-faint"
                } ${auto ? "opacity-90" : ""}`}
                title={auto ? "Indoor courts always have lights" : undefined}
              >
                <Icon size={13} /> {label}
                {auto ? <span className="rounded bg-white/70 px-1 font-mono text-floor font-bold tracking-[0.08em]">AUTO</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile pane switch ─────────────────────────────────────────────── */}
      <div className="mt-4 flex min-[900px]:hidden">
        <div className="inline-flex gap-0.5 rounded-[11px] bg-ink/5 p-[3px]">
          {(
            [
              { key: "list" as const, label: "List", Icon: List },
              { key: "map" as const, label: "Map", Icon: MapIcon },
            ]
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPane(key)}
              className={`press inline-flex h-8 items-center gap-1.5 rounded-lg border px-4 text-xs font-semibold ${
                pane === key ? "border-rule-2 bg-surface text-ink" : "border-transparent text-mute"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results + map ──────────────────────────────────────────────────── */}
      <div className="mt-4 grid items-start gap-[18px] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,52%)]">
        <div className={pane === "map" ? "hidden min-[900px]:block" : ""}>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-faint">
              {shown.length} {shown.length === 1 ? "COURT" : "COURTS"} WITHIN {f.radius} MI{originLabel ? ` OF ${originLabel.toUpperCase()}` : ""}{liveBusy ? " · SEARCHING LIVE…" : ""}
            </span>
            <span className="flex-1" />
            <label className="flex items-center gap-2">
              {pending ? (
                // Directory reload for the new filters — real work, but not a
                // search. The live search announces itself separately, next to
                // the result count, as "SEARCHING LIVE…".
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-mute"><Loader2 size={11} className="animate-spin" /> UPDATING</span>
              ) : scanKicked ? (
                <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#DCEBC0] bg-[#F1F8E3] px-2 py-0.5 font-mono text-floor font-semibold tracking-[0.1em] text-[#4D7C0F]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4D7C0F]" /> EXPANDING COVERAGE</span>
              ) : null}
              <span className="font-mono text-floor font-semibold uppercase tracking-[0.16em] text-faint">Sort</span>
              <select
                value={f.sort}
                onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}
                className="h-8 rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs font-semibold text-ink outline-none focus:border-brand"
              >
                <option value="nearest">Nearest first</option>
                <option value="active">Most active</option>
                <option value="rated">Highest rated</option>
                <option value="courts">Most courts</option>
              </select>
            </label>
          </div>

          <div ref={listRef} className="flex h-[596px] flex-col gap-2.5 overflow-y-auto rounded-[18px] border border-[#EFE9DC] bg-[#FDFBF7] p-3 [overscroll-behavior:contain] [scrollbar-width:thin] [scrollbar-color:#E4DCCB_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#E4DCCB] [&::-webkit-scrollbar-track]:bg-transparent">
            {!origin ? (
              <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-rule bg-surface p-8 text-center">
                <div>
                  <p className="text-sm font-bold text-ink">Where do you want to play?</p>
                  <p className="mt-1 text-xs text-mute">Enter a ZIP or city above and hit Find courts.</p>
                </div>
              </div>
            ) : shown.length === 0 ? (
              <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-rule bg-surface p-8 text-center">
                <div>
                  {live && live.status !== "ok" ? (
                    <p className="mx-auto mb-3 max-w-[340px] rounded-xl border border-brand/30 bg-tint-brand px-3.5 py-2.5 text-xs font-semibold text-brand-deep">
                      {live.status === "not_configured"
                        ? "Live search isn’t configured — the server is missing GOOGLE_MAPS_API_KEY or ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables)."
                        : live.message ?? "Live search found nothing within 50 miles."}
                    </p>
                  ) : null}
                  {liveBusy ? <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-faint">Searching live via Google + Klimr screening…</p> : null}
                  <p className="text-sm font-bold text-ink">No courts match these filters.</p>
                  <p className="mt-1 text-xs text-mute">Widen the radius or clear a filter — or add the spot you play.</p>
                  <Link href="/courts/suggest" className="press mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-hover">
                    <Plus size={13} /> Suggest a court
                  </Link>
                </div>
              </div>
            ) : (
              shown.map((c, i) => (
                <CourtCard
                  key={c.id}
                  court={c}
                  index={i + 1}
                  selected={effectiveSelectedId === c.id}
                  hovered={hoveredId === c.id}
                  onSelect={() => setSelectedId(effectiveSelectedId === c.id ? null : c.id)}
                  onHover={setHoveredId}
                />
              ))
            )}
          </div>

          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-faint">
            <ShieldCheck size={13} className="mt-px shrink-0" />
            Every result is screened against real evidence — the venue’s own name and website — before it appears. Spot something wrong? Report it from the court page.
          </p>
        </div>

        <div className={pane === "list" ? "hidden min-[900px]:block" : ""}>
          <CourtsMap
            token={mapboxToken}
            courts={shown}
            origin={origin}
            radiusMi={f.radius}
            originLabel={originLabel}
            selectedId={effectiveSelectedId}
            hoveredId={hoveredId}
            onSelect={selectFromMap}
            onHover={setHoveredId}
          />
        </div>
      </div>
    </div>
  );
}

function CourtCard({
  court: c,
  index,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  court: Row;
  index: number;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const meta = [
    `${c.distanceMi} MI`,
    c.area ? c.area.toUpperCase() : null,
    c.courtCount ? `${c.courtCount} ${c.courtCount === 1 ? "COURT" : "COURTS"}` : null,
  ].filter(Boolean);
  return (
    <article
      data-court={c.id}
      onMouseEnter={() => onHover(c.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
      className={`cursor-pointer rounded-[15px] border bg-surface p-4 shadow-[0_1px_2px_rgba(80,60,30,.04)] transition-all ${
        selected ? "border-brand ring-4 ring-brand/10" : hovered ? "-translate-y-px border-rule-2 shadow-e2" : "border-rule"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-brand font-mono text-[11.5px] font-bold text-white">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14.5px] font-bold tracking-[-0.01em] text-ink">{c.name}</h3>
            {c.verified ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF6EC] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#217A34]">VERIFIED ✓</span>
            ) : c.listedUnverified ? (
              <span title="Found in search results — Klimr hasn't source-confirmed this venue for this sport yet." className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-mute">LISTED · UNVERIFIED</span>
            ) : null}
            {c.isPrivate ? (
              <span className="rounded-md bg-bg px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-faint">PRIVATE / MEMBERS</span>
            ) : null}
            {c.liveQueue ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF6EC] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#217A34]">
                <span aria-hidden className="h-1 w-1 animate-pulse rounded-full bg-[#2FA44F]" /> LIVE QUEUE
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-floor tracking-[0.1em] text-faint">{meta.join(" · ")}</p>
        </div>
        <div className="shrink-0 text-right">
          {c.memberRating != null ? (
            <>
              <p className="inline-flex items-center gap-1 text-sm font-bold text-ink">
                <Star size={13} className="fill-[#D9A70B] text-[#D9A70B]" /> {c.memberRating.toFixed(1)}
              </p>
              <p className="font-mono text-floor tracking-[0.1em] text-faint">
                {c.memberReviewCount} KLIMR {c.memberReviewCount === 1 ? "REVIEW" : "REVIEWS"}
              </p>
              {c.googleRating != null ? (
                <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-floor tracking-[0.06em] text-faint" title={`${c.googleRatingCount} Google reviews`}>
                  <span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-[4px] border border-rule-2 bg-surface text-floor font-bold text-mute">G</span>
                  {c.googleRating.toFixed(1)} · {c.googleRatingCount}
                </p>
              ) : null}
            </>
          ) : c.googleRating != null ? (
            // No member reviews yet — Google carries the star so the card
            // still answers "is this place any good?"
            <>
              <p className="inline-flex items-center gap-1 text-sm font-bold text-ink">
                <Star size={13} className="fill-[#D9A70B] text-[#D9A70B]" /> {c.googleRating.toFixed(1)}
              </p>
              <p className="font-mono text-floor tracking-[0.1em] text-faint">
                {c.googleRatingCount} GOOGLE {c.googleRatingCount === 1 ? "REVIEW" : "REVIEWS"}
              </p>
            </>
          ) : null}
          {c.busy ? (
            <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] ${BUSY_STYLE[c.busy]}`}>{c.busy}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {c.sports.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-[9px] border border-rule-soft bg-bg px-2 py-1 text-[11px] font-bold text-ink-soft">
            <SportIcon sport={s} variant="glyph" size={12} /> {SPORTS.find((x) => x.key === s)?.name ?? s}
          </span>
        ))}
        {(c as Row).venueKnown === false ? null : c.indoor ? (
          <span className="inline-flex items-center gap-1 rounded-[9px] border border-rule-soft bg-bg px-2 py-1 text-[11px] font-semibold text-mute"><Warehouse size={11} /> Indoor</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-[9px] border border-rule-soft bg-bg px-2 py-1 text-[11px] font-semibold text-mute"><Sun size={11} /> Outdoor</span>
        )}
        {c.lights === true ? (
          <span className="inline-flex items-center gap-1 rounded-[9px] border border-rule-soft bg-bg px-2 py-1 text-[11px] font-semibold text-mute"><Lightbulb size={11} /> Lights</span>
        ) : null}
        {c.free === true ? (
          <span className="inline-flex items-center gap-1 rounded-[9px] border border-rule-soft bg-bg px-2 py-1 text-[11px] font-semibold text-mute"><Tag size={11} /> Free</span>
        ) : c.free === false ? (
          <span className="inline-flex items-center gap-1 rounded-[9px] border border-rule-soft bg-bg px-2 py-1 text-[11px] font-semibold text-mute"><Tag size={11} /> Reserved</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule-soft pt-3">
        {c.activePlayers > 0 ? (
          <span className="flex items-center gap-2">
            {c.recent.length ? (
              <span className="flex -space-x-[7px]">
                {c.recent.map((p) => (
                  <span
                    key={p.id}
                    title={p.name}
                    className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white text-floor font-bold text-white"
                    style={{ background: disc(p.hue) }}
                  >
                    {initialsOf(p.name)}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="min-w-[118px] flex-[1_1_130px] truncate text-xs font-semibold text-mute">
              {c.activePlayers} Klimr {c.activePlayers === 1 ? "player plays" : "players play"} here
            </span>
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="press inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-rule-2 bg-surface px-3 text-xs font-bold text-ink hover:bg-hover"
        >
          <Navigation size={12} /> Directions
        </a>
        {c.liveFound ? (
          c.website ? (
            <a
              href={c.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="press inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-brand px-3.5 text-xs font-bold text-white hover:bg-brand-deep"
            >
              Website <ArrowRight size={12} />
            </a>
          ) : null
        ) : (
          <Link
            href={`/courts/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="press inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-brand px-3.5 text-xs font-bold text-white hover:bg-brand-deep"
          >
            View court <ArrowRight size={12} />
          </Link>
        )}
        </span>
      </div>
    </article>
  );
}
