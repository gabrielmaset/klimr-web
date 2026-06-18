"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MapPin, Star, ChevronRight, X } from "lucide-react";
import { SPORTS, sportMeta } from "@/lib/sports";
import { CourtsMap, type MapCourt } from "./courts-map";

export type ExplorerCourt = MapCourt & {
  amenities: string[];
  rating: number;
  reviews: number;
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} className={n <= Math.round(value) ? "fill-pop text-pop" : "text-rule"} />
      ))}
    </span>
  );
}

export function CourtsExplorer({ courts, mapboxToken }: { courts: ExplorerCourt[]; mapboxToken: string | null }) {
  const [q, setQ] = useState("");
  const [sport, setSport] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courts.filter((c) => {
      if (sport && !c.sports.includes(sport)) return false;
      if (!needle) return true;
      const hay = [c.name, c.neighborhood, c.city, ...(c.amenities ?? [])].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [courts, q, sport]);

  const chipStyle = (on: boolean) => ({
    borderColor: on ? "#ff4e1b" : "#e4e4e7",
    background: on ? "#fff1ed" : "transparent",
    color: on ? "#d63a0f" : "#71717a",
  });
  const chipCls = "press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors";

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courts, neighborhoods, amenities…"
          className="h-11 w-full rounded-2xl border border-rule bg-surface pl-10 pr-10 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
          aria-label="Search courts"
        />
        {q ? (
          <button
            onClick={() => setQ("")}
            className="press absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-faint hover:text-ink"
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {/* Sport filters */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setSport(null)} className={chipCls} style={chipStyle(!sport)}>
          All
        </button>
        {SPORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSport((cur) => (cur === s.key ? null : s.key))}
            className={chipCls}
            style={chipStyle(sport === s.key)}
          >
            {s.emoji} {s.name}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="mb-5">
        <CourtsMap token={mapboxToken} courts={filtered} />
      </div>

      {/* Count */}
      <div className="mb-2 px-0.5 text-xs font-medium text-faint">
        {filtered.length} {filtered.length === 1 ? "court" : "courts"}
        {sport ? ` · ${sportMeta(sport).emoji} ${sportMeta(sport).name}` : ""}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
          No courts match your search.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/courts/${c.id}`}
              className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5]">
                <MapPin size={18} className="text-ink" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                <span className="block truncate text-xs text-mute">
                  {[c.neighborhood, c.city].filter(Boolean).join(", ")} · {c.sports.map((s) => sportMeta(s).emoji).join(" ")}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                  {c.reviews > 0 ? (
                    <>
                      <Stars value={c.rating} /> {c.rating.toFixed(1)} · {c.reviews} review{c.reviews === 1 ? "" : "s"}
                    </>
                  ) : (
                    "No reviews yet"
                  )}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
