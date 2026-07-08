"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Star, Lock, Loader2, MapPin, Check, X } from "lucide-react";
import { courtsNearZip, searchCourts, type PickerCourt } from "@/app/courts/search-actions";

const KM_PER_MI = 1.60934;

export function CourtPicker({
  sport,
  defaultZip,
  selected,
  onSelect,
}: {
  sport: string;
  defaultZip: string;
  selected: PickerCourt | null;
  onSelect: (c: PickerCourt | null) => void;
}) {
  const [zip, setZip] = useState(defaultZip);
  const [list, setList] = useState<PickerCourt[]>([]);
  const [loading, setLoading] = useState(false); // free directory list
  const [searching, setSearching] = useState(false); // explicit paid search
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lastReq = useRef("");

  // Auto-load the FREE list whenever sport + ZIP are ready (and on change).
  // setState-in-effect is intentional here (fetch-on-dependency-change).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selected) return; // not browsing while one is chosen
    if (!sport || zip.length !== 5) {
      setList([]);
      setLoaded(false);
      return;
    }
    const reqKey = `${zip}:${sport}`;
    lastReq.current = reqKey;
    setLoading(true);
    setNotice(null);
    courtsNearZip({ zip, sport })
      .then((r) => {
        if (lastReq.current !== reqKey) return;
        setList(r.courts);
        setLoaded(true);
      })
      .catch(() => {
        if (lastReq.current === reqKey) {
          setList([]);
          setLoaded(true);
        }
      })
      .finally(() => {
        if (lastReq.current === reqKey) setLoading(false);
      });
  }, [sport, zip, selected]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function searchNearby() {
    if (searching || !sport || zip.length !== 5) return;
    setSearching(true);
    setNotice(null);
    try {
      const r = await searchCourts({ locationKey: zip, radiusKm: Math.round(25 * KM_PER_MI), sport });
      const mapped: PickerCourt[] = (r.courts ?? []).map((c) => ({
        key: c.id,
        courtId: null,
        placeId: c.id,
        name: c.name,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        rating: c.rating,
        ratingCount: c.ratingCount,
        private: c.private,
        sport,
        distanceKm: c.distanceKm ?? null,
        website: c.website ?? null,
      }));
      setList((prev) => {
        const seen = new Set(prev.map((p) => p.placeId ?? p.key));
        const merged = [...prev];
        for (const m of mapped) if (!seen.has(m.placeId ?? m.key)) merged.push(m);
        return merged.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
      });
      setLoaded(true);
      if (r.status === "empty") setNotice(r.message ?? "No courts found within 50 miles.");
      else if (r.expanded) setNotice("Nothing within 25 mi — added the nearest within 50 miles.");
      else if (r.status === "capped") setNotice(r.message ?? "Live search is at this month's limit.");
      else if (r.status === "not_configured") setNotice("Live search isn't switched on yet.");
    } catch {
      setNotice("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  const miLabel = (km: number | null) => (km == null ? null : `${(km / KM_PER_MI).toFixed(1)} mi`);

  return (
    <div>
      <label className="kicker text-faint">Court</label>

      {selected ? (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-brand/40 bg-tint-brand px-4 py-3">
          <Check size={16} className="shrink-0 text-brand-deep" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-ink">{selected.name}</span>
              {selected.private ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-mute">
                  <Lock size={10} /> Private
                </span>
              ) : null}
            </span>
            {selected.address ? <span className="block truncate text-xs text-mute">{selected.address}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="press inline-flex shrink-0 items-center gap-1 rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-mute transition-colors hover:text-ink"
          >
            <X size={12} /> Change
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-44">
              <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder="Near ZIP"
                aria-label="Court search ZIP"
                className="h-10 w-full rounded-xl border border-rule bg-surface shadow-e1 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </div>
            <p className="text-xs text-faint">{sport ? "Courts near this ZIP — free, no search needed." : "Pick a sport first."}</p>
          </div>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-6 text-center text-sm text-mute">Loading nearby courts…</div>
            ) : !sport || zip.length !== 5 ? null : list.length === 0 && loaded ? (
              <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-6 text-center text-sm text-mute">No saved courts near here yet — try a search below.</div>
            ) : (
              list.slice(0, 8).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onSelect(c)}
                  className="lift flex w-full items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-3.5 text-left"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg">
                    <MapPin size={16} className="text-ink" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink">{c.name}</span>
                      {c.private ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold text-mute">
                          <Lock size={10} /> Private
                        </span>
                      ) : null}
                    </span>
                    {c.address ? <span className="block truncate text-xs text-mute">{c.address}</span> : null}
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                      {c.rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star size={11} className="fill-pop text-pop" /> {c.rating.toFixed(1)}
                          {c.ratingCount != null ? ` (${c.ratingCount})` : ""}
                        </span>
                      ) : null}
                      {miLabel(c.distanceKm) ? <span>· {miLabel(c.distanceKm)}</span> : null}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={searchNearby}
              disabled={searching || !sport || zip.length !== 5}
              className="press inline-flex h-9 items-center justify-center gap-2 rounded-full border border-rule bg-surface px-4 text-xs font-semibold text-ink transition-colors hover:bg-bg disabled:opacity-50"
            >
              {searching ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Searching…
                </>
              ) : (
                <>
                  <Search size={13} /> Search nearby courts
                </>
              )}
            </button>
            <span className="text-xs text-faint">Not listed? Run a live lookup.</span>
          </div>
          {notice ? <p className="mt-2 text-xs text-mute">{notice}</p> : null}
        </>
      )}
    </div>
  );
}
