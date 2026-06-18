"use client";

import { useState } from "react";
import { Search, MapPin, Star, Lock, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { SPORTS, sportMeta } from "@/lib/sports";
import { CourtsMap } from "./courts-map";
import { searchCourts, type CourtResult, type SearchResponse } from "./search-actions";

const KM_PER_MI = 1.60934;
const RADII_MI = [3, 5, 10, 25];

function CourtRow({ c }: { c: CourtResult }) {
  const mi = (c.distanceKm / KM_PER_MI).toFixed(1);
  const maps = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
  return (
    <a
      href={maps}
      target="_blank"
      rel="noopener noreferrer"
      className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5]">
        <MapPin size={18} className="text-ink" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-ink">{c.name}</span>
          {c.private ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[10px] font-semibold text-mute">
              <Lock size={10} /> Private
            </span>
          ) : null}
        </span>
        {c.address ? <span className="block truncate text-xs text-mute">{c.address}</span> : null}
        <span className="mt-0.5 flex items-center gap-2 text-xs text-faint">
          {c.rating != null ? (
            <span className="inline-flex items-center gap-1">
              <Star size={12} className="fill-pop text-pop" /> {c.rating.toFixed(1)}
              {c.ratingCount != null ? ` (${c.ratingCount})` : ""}
            </span>
          ) : null}
          <span>· {mi} mi away</span>
        </span>
      </span>
      <ExternalLink size={16} className="shrink-0 text-faint" />
    </a>
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
  const [zip, setZip] = useState(defaultZip);
  const [sport, setSport] = useState(defaultSport);
  const [radiusMi, setRadiusMi] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<SearchResponse | null>(null);

  async function run() {
    if (loading || zip.length !== 5) return;
    setLoading(true);
    try {
      const r = await searchCourts({ zip, radiusKm: Math.round(radiusMi * KM_PER_MI), sport });
      setResp(r);
    } catch {
      setResp({ status: "error", courts: [], source: "none", message: "Search failed. Try again." });
    } finally {
      setLoading(false);
    }
  }

  const courts = resp?.courts ?? [];
  const mapCourts = courts.map((c) => ({
    id: c.id,
    name: c.name,
    sports: [c.sport],
    neighborhood: null,
    city: c.address,
    lat: c.lat,
    lng: c.lng,
  }));

  const notice =
    resp?.status === "not_configured"
      ? "Court search isn't switched on yet — check back soon."
      : resp?.message ?? (resp?.status === "empty" ? "No courts found in that area. Try a wider radius." : null);

  const chipStyle = (on: boolean) => ({
    borderColor: on ? "#ff4e1b" : "#e4e4e7",
    background: on ? "#fff1ed" : "transparent",
    color: on ? "#d63a0f" : "#71717a",
  });

  return (
    <div>
      {/* Search controls */}
      <div className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <MapPin size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              inputMode="numeric"
              placeholder="ZIP code"
              aria-label="ZIP code"
              className="h-11 w-full rounded-2xl border border-rule bg-bg pl-10 pr-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
          </div>
          <button
            onClick={run}
            disabled={loading || zip.length !== 5}
            className="press inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Search size={15} /> Find courts
              </>
            )}
          </button>
        </div>

        {/* Radius */}
        <div className="mt-3">
          <span className="kicker text-faint">Within</span>
          <div className="mt-1 inline-flex flex-wrap gap-1 rounded-xl border border-rule bg-[#f4f4f5] p-1">
            {RADII_MI.map((r) => {
              const on = radiusMi === r;
              return (
                <button
                  key={r}
                  onClick={() => setRadiusMi(r)}
                  className="press rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ background: on ? "#fff" : "transparent", color: on ? "#0a0a0b" : "#71717a", boxShadow: on ? "0 1px 2px rgba(10,10,11,.12)" : "none" }}
                >
                  {r} mi
                </button>
              );
            })}
          </div>
        </div>

        {/* Sport */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
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

      {/* Map */}
      <div className="mt-5">
        <CourtsMap token={mapboxToken} courts={mapCourts} />
      </div>

      {/* Results */}
      <div className="mt-4">
        {resp === null ? (
          <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
            Enter a ZIP, pick a sport, and find courts near you.
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">Searching nearby courts…</div>
        ) : courts.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">{notice ?? "No courts found."}</div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <span className="text-xs font-medium text-faint">
                {courts.length} {courts.length === 1 ? "court" : "courts"} · {sportMeta(sport).emoji} {sportMeta(sport).name}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                <ShieldCheck size={12} /> AI-screened{resp.source === "cache" ? " · recent" : ""}
              </span>
            </div>
            {notice ? <p className="mb-2 px-0.5 text-xs text-mute">{notice}</p> : null}
            <div className="space-y-2.5">
              {courts.map((c) => (
                <CourtRow key={c.id} c={c} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
