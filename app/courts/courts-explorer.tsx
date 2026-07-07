"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Star, Lock, ExternalLink, Loader2, ShieldCheck, CalendarPlus, Check, Globe } from "lucide-react";
import { SPORTS, sportMeta } from "@/lib/sports";
import { CourtsMap } from "./courts-map";
import { searchCourts, suggestCities, checkZip, type CourtResult, type SearchResponse, type CitySuggestion } from "./search-actions";

const KM_PER_MI = 1.60934;
const RADII_MI = [3, 5, 10, 25];
const PAGE = 5;

function CourtRow({ c, n }: { c: CourtResult; n: number }) {
  const mi = (c.distanceKm / KM_PER_MI).toFixed(1);
  // Land on the actual business listing (name + address) rather than a bare
  // coordinate pin. When we have the Google place id, pin it exactly.
  const mapsQuery = encodeURIComponent([c.name, c.address].filter(Boolean).join(", ") || `${c.lat},${c.lng}`);
  const looksLikePlaceId = typeof c.id === "string" && /^[A-Za-z0-9_-]{20,}$/.test(c.id) && !/^[0-9a-f-]{36}$/i.test(c.id);
  const maps = looksLikePlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}&query_place_id=${c.id}`
    : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  function scheduleHere() {
    if (creating) return;
    // Hand the court to the new-match form via the URL; it persists on submit.
    const p = new URLSearchParams();
    if (c.sport) p.set("sport", c.sport);
    p.set("placeId", c.id);
    p.set("name", c.name);
    if (c.address) p.set("address", c.address);
    if (typeof c.lat === "number") p.set("lat", String(c.lat));
    if (typeof c.lng === "number") p.set("lng", String(c.lng));
    if (typeof c.rating === "number") p.set("rating", String(c.rating));
    if (typeof c.ratingCount === "number") p.set("ratingCount", String(c.ratingCount));
    if (c.private) p.set("private", "1");
    if (c.website) p.set("website", c.website);
    setCreating(true);
    router.push(`/play/new?${p.toString()}`);
  }

  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-surface">{n}</span>
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-ink">{c.name}</span>
            {c.private ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold text-mute">
                <Lock size={10} /> Private
              </span>
            ) : null}
          </span>
          {c.address ? <span className="block truncate text-xs text-mute">{c.address}</span> : null}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            {c.rating != null ? (
              <span className="inline-flex items-center gap-1">
                <Star size={12} className="fill-pop text-pop" /> {c.rating.toFixed(1)}
                {c.ratingCount != null ? ` (${c.ratingCount})` : ""}
              </span>
            ) : null}
            <span>· {mi} mi away</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            <a href={maps} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 font-semibold text-brand-deep hover:underline">
              <ExternalLink size={12} /> Open in Maps
            </a>
            {c.website ? (
              <a href={c.website} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 font-semibold text-brand-deep hover:underline">
                <Globe size={12} /> Website
              </a>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          onClick={scheduleHere}
          disabled={creating}
          aria-label={`Schedule a match at ${c.name}`}
          className="press inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <CalendarPlus size={14} />}
          <span className="hidden sm:inline">Schedule a match</span>
        </button>
      </div>
    </div>
  );
}

export function CourtsExplorer({
  defaultZip,
  defaultSport,
  mapboxToken,
}: {
  defaultZip: string;
  defaultSport: string;
  mapboxToken: string | null;
}) {
  const [query, setQuery] = useState(defaultZip);
  const [selected, setSelected] = useState<{ key: string; label: string } | null>(null);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [sport, setSport] = useState(defaultSport);
  const [radiusMi, setRadiusMi] = useState(10);
  const [searchedMi, setSearchedMi] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<SearchResponse | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const reqRef = useRef(0);
  const skipNextRef = useRef(false);

  // Resolve the typed location: digits → validate a ZIP; letters → suggest cities.
  // Debounced; every lookup is free + local. setState-in-effect is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const q = query.trim();
    setSelected(null);
    setLocMsg(null);
    if (!q) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }
    const digits = /^\d+$/.test(q);
    const t = setTimeout(() => {
      if (digits) {
        setSuggestions([]);
        setShowSug(false);
        if (q.length === 5) {
          const id = ++reqRef.current;
          checkZip(q)
            .then((r) => {
              if (id !== reqRef.current) return;
              if (r.valid) setSelected({ key: q, label: r.label ?? q });
              else setLocMsg("That ZIP code doesn't exist.");
            })
            .catch(() => {});
        }
      } else if (q.length >= 2) {
        const id = ++reqRef.current;
        suggestCities(q)
          .then((list) => {
            if (id !== reqRef.current) return;
            setSuggestions(list);
            setShowSug(list.length > 0);
            if (list.length === 0) setLocMsg("No matching US cities.");
          })
          .catch(() => {});
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function choose(s: CitySuggestion) {
    skipNextRef.current = true;
    setQuery(s.label);
    setSelected({ key: s.key, label: s.label });
    setSuggestions([]);
    setShowSug(false);
    setLocMsg(null);
  }

  async function run() {
    if (loading || !selected) return;
    setShowSug(false);
    setLoading(true);
    setVisible(PAGE);
    setSearchedMi(radiusMi);
    try {
      const r = await searchCourts({ locationKey: selected.key, radiusKm: Math.round(radiusMi * KM_PER_MI), sport });
      setResp(r);
    } catch {
      setResp({ status: "error", courts: [], source: "none", message: "Search failed. Try again." });
    } finally {
      setLoading(false);
    }
  }

  const allCourts = resp?.courts ?? [];
  const shown = allCourts.slice(0, visible);
  const mapCourts = shown.map((c, i) => ({
    id: c.id,
    name: c.name,
    sports: [c.sport],
    neighborhood: null,
    city: c.address,
    lat: c.lat,
    lng: c.lng,
    label: String(i + 1),
  }));

  const notice =
    resp?.status === "not_configured"
      ? "Court search isn't switched on yet — check back soon."
      : resp?.message ?? (resp?.status === "empty" ? "No courts found within 50 miles." : null);

  const chipStyle = (on: boolean) => ({
    borderColor: on ? "var(--color-brand)" : "var(--color-rule)",
    background: on ? "var(--color-tint-brand)" : "transparent",
    color: on ? "var(--color-brand-deep)" : "var(--color-mute)",
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      {/* LEFT — search + results stack (narrower column) */}
      <div className="space-y-5">
        {/* Search controls */}
        <div className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <MapPin size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSug(true);
              }}
              onBlur={() => setTimeout(() => setShowSug(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selected) run();
                else if (e.key === "Escape") setShowSug(false);
              }}
              placeholder="ZIP code or city"
              aria-label="ZIP code or city"
              autoComplete="off"
              className="h-11 w-full rounded-2xl border border-rule bg-bg pl-10 pr-9 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
              style={locMsg ? { borderColor: "var(--color-danger)" } : undefined}
            />
            {selected ? (
              <Check size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
            ) : null}
            {showSug && suggestions.length > 0 ? (
              <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-rule bg-surface py-1 shadow-[0_12px_32px_-12px_rgba(10,10,11,0.3)]">
                {suggestions.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(s)}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-bg"
                    >
                      <MapPin size={14} className="shrink-0 text-faint" />
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            onClick={run}
            disabled={loading || !selected}
            aria-busy={loading}
            className="press inline-flex h-11 min-w-[150px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={15} />}
            {loading ? "Searching…" : "Find courts"}
          </button>
        </div>
        {locMsg ? <p className="mt-2 px-1 text-xs text-danger">{locMsg}</p> : null}

        {/* Radius */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="kicker text-faint">Within</span>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-rule bg-bg p-1">
            {RADII_MI.map((r) => {
              const on = radiusMi === r;
              return (
                <button
                  key={r}
                  onClick={() => setRadiusMi(r)}
                  className="press rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ background: on ? "var(--color-surface)" : "transparent", color: on ? "var(--color-ink)" : "var(--color-mute)", boxShadow: on ? "0 1px 2px rgba(10,10,11,.12)" : "none" }}
                >
                  {r} mi
                </button>
              );
            })}
          </div>
        </div>

        {/* Sport */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SPORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSport(s.key)}
              className="press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={chipStyle(sport === s.key)}
            >
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
        </div>

        {/* Results list */}
        <div>
          {resp === null ? (
            <div className="grid h-full min-h-[200px] place-items-center rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
              Enter a ZIP or city, pick a sport, and find courts near you.
            </div>
          ) : loading ? (
            <div className="grid h-full min-h-[200px] place-items-center rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
              Searching nearby courts…
            </div>
          ) : shown.length === 0 ? (
            <div className="grid h-full min-h-[200px] place-items-center rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
              {notice ?? "No courts found."}
            </div>
          ) : (
            <>
              {resp.expanded ? (
                <div className="mb-2.5 rounded-xl border border-rule bg-[#fff8f0] px-3 py-2 text-xs text-mute">
                  No {sportMeta(sport).name.toLowerCase()} courts within {searchedMi} mi — showing the nearest within 50 miles.
                </div>
              ) : null}
              <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
                <span className="text-xs font-medium text-faint">
                  {allCourts.length} {allCourts.length === 1 ? "court" : "courts"} · {sportMeta(sport).emoji} {sportMeta(sport).name}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                  <ShieldCheck size={12} /> AI-screened{resp.source === "cache" ? " · recent" : ""}
                </span>
              </div>
              {notice ? <p className="mb-2 px-0.5 text-xs text-mute">{notice}</p> : null}
              <div className="space-y-2.5">
                {shown.map((c, i) => (
                  <CourtRow key={c.id} c={c} n={i + 1} />
                ))}
              </div>
              {allCourts.length > visible ? (
                <button
                  type="button"
                  onClick={() => setVisible((v) => Math.min(allCourts.length, v + PAGE))}
                  className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-rule bg-surface py-3 text-sm font-semibold text-ink transition-colors hover:bg-bg"
                >
                  More results <span className="font-normal text-faint">({allCourts.length - visible} more)</span>
                </button>
              ) : allCourts.length > PAGE ? (
                <p className="mt-3 px-0.5 text-center text-xs text-faint">Showing all {allCourts.length}.</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* RIGHT — tall map, top-aligned with the search card */}
      <div className="lg:sticky lg:top-6">
        <CourtsMap token={mapboxToken} courts={mapCourts} tall />
      </div>
    </div>
  );
}
