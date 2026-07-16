"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SportIcon } from "@/components/sport-icons";
import { FilterGroup, FacetRow } from "@/components/filter-chips";
import { EventsMap } from "@/components/events-map";
import { resolveEventArea } from "@/app/events/area-actions";
import { reportClientError } from "@/lib/client-diagnostics";
import Link from "next/link";
import { Search, MapPin, Users, Check, CalendarDays } from "lucide-react";
import { sportMeta } from "@/lib/sports";

export type CardEvent = {
  id: string;
  title: string;
  sportKey: string;
  kind: string;
  whenIso: string;
  venue: string | null;
  goingCount: number;
  capacity: number | null;
  amGoing: boolean;
  lat: number | null;
  lng: number | null;
  coverUrl: string | null;
  costText: string | null;
  mine?: boolean;
  status?: string;
};

const TZ = "America/Los_Angeles";
const KIND_LABEL: Record<string, string> = { open_play: "Open play", ladder: "Ladder night", clinic: "Clinic", tournament: "Tournament", social: "Social" };
const SPORT_HUE: Record<string, number> = { tennis: 96, pickleball: 40, padel: 205, racquetball: 270, beach_volleyball: 22 };

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: TZ });
const isFree = (c: string | null) => !c || /free/i.test(c.trim());
/** Best-effort dollars from costText ("$15", "15/person") — null when unparsable. */
const costDollars = (c: string | null): number | null => {
  if (isFree(c)) return 0;
  const m = c!.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
};
const gradientFor = (sportKey: string) => {
  const h = SPORT_HUE[sportKey] ?? 210;
  return `linear-gradient(140deg, hsl(${h} 72% 90%), hsl(${(h + 30) % 360} 74% 80%))`;
};

type Chip = { value: string; label: ReactNode };
function toggleIn(set: Set<string>, v: string): Set<string> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function ClearLink({ n, onClear }: { n: number; onClear: () => void }) {
  if (n === 0) return null;
  return (
    <button type="button" onClick={onClear} className="press font-mono text-[9px] font-bold uppercase tracking-[.14em] text-brand-deep hover:underline">
      {n} · Clear
    </button>
  );
}

export function EventsBrowser({ events, myEvents = [], nowMs, mapboxToken = null }: { events: CardEvent[]; myEvents?: CardEvent[]; nowMs: number; mapboxToken?: string | null }) {
  const [mode, setMode] = useState<"browse" | "mine">("browse");
  const [q, setQ] = useState("");
  const [sports, setSports] = useState<Set<string>>(new Set());
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState("all");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [when, setWhen] = useState("all");
  const [nearMi, setNearMi] = useState<number | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [areaQ, setAreaQ] = useState("");
  const [areaBusy, setAreaBusy] = useState(false);

  const searchArea = async () => {
    const q = areaQ.trim();
    if (!q || areaBusy) return;
    setAreaBusy(true);
    setGeoErr(null);
    try {
      const hit = await resolveEventArea(q);
      if (hit) {
        setGeo({ lat: hit.lat, lng: hit.lng });
        setGeoLabel(hit.label);
        if (nearMi === null) setNearMi(25);
      } else {
        setGeoErr("That location isn\u2019t recognized \u2014 try a city name or 5-digit ZIP.");
      }
    } finally {
      setAreaBusy(false);
    }
  };

  const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 3958.8;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  const requestNear = (mi: number) => {
    setGeoErr(null);
    if (geo) {
      setNearMi(mi);
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeoErr("Location isn\u2019t available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLabel("Your location");
        setNearMi(mi);
      },
      (err) => {
        const shown =
          err.code === 1
            ? "Location permission denied \u2014 allow it in your browser, or type a city/ZIP instead."
            : "Couldn\u2019t get your location \u2014 type a city or ZIP instead.";
        reportClientError({
          level: "warn",
          message: `Events proximity geolocation failed (code ${err.code})`,
          detail: err.message,
          userMessage: shown,
        });
        setGeoErr(shown);
      },
      { maximumAge: 300000, timeout: 8000 },
    );
  };

  const base = mode === "mine" ? myEvents : events;
  const allSports = useMemo(() => [...new Set(base.map((e) => e.sportKey))], [base]);
  const allKinds = useMemo(() => [...new Set(base.map((e) => e.kind))], [base]);

  const filtered = useMemo(() => {
    const day = 86400000;
    return base.filter((e) => {
      if (sports.size > 0 && !sports.has(e.sportKey)) return false;
      if (kinds.size > 0 && !kinds.has(e.kind)) return false;
      if (price === "free" && !isFree(e.costText)) return false;
      if (price === "paid" && isFree(e.costText)) return false;
      const minV = minP.trim() ? parseFloat(minP) : null;
      const maxV = maxP.trim() ? parseFloat(maxP) : null;
      if (minV != null || maxV != null) {
        const cost = costDollars(e.costText);
        if (cost != null) {
          if (minV != null && cost < minV) return false;
          if (maxV != null && cost > maxV) return false;
        }
      }
      if (when !== "all") {
        const t = new Date(e.whenIso).getTime();
        if (when === "week" && !(t >= nowMs && t <= nowMs + 7 * day)) return false;
        if (when === "month" && !(t >= nowMs && t <= nowMs + 31 * day)) return false;
        if (when === "weekend") {
          const now = new Date(nowMs);
          const daysToSat = (6 - now.getDay() + 7) % 7;
          const sat = new Date(nowMs);
          sat.setHours(0, 0, 0, 0);
          sat.setDate(sat.getDate() + daysToSat);
          const mon = sat.getTime() + 2 * day;
          if (t < sat.getTime() || t >= mon) return false;
        }
      }
      if (nearMi !== null && geo) {
        if (e.lat == null || e.lng == null) return false;
        if (milesBetween(geo, { lat: e.lat, lng: e.lng }) > nearMi) return false;
      }
      if (q.trim()) {
        const hay = `${e.title} ${e.venue ?? ""} ${KIND_LABEL[e.kind] ?? ""} ${sportMeta(e.sportKey).name}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [base, q, sports, kinds, price, minP, maxP, when, nowMs, nearMi, geo]);

  const sportChips: Chip[] = allSports.map((s) => ({
    value: s,
    label: (
      <span className="inline-flex items-center gap-1.5">
        <SportIcon sport={s} variant="badge" size={14} /> {sportMeta(s).name}
      </span>
    ),
  }));
  const kindChips: Chip[] = allKinds.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }));

  return (
    <div>
      {myEvents.length > 0 ? (
        <div className="mb-4 inline-flex rounded-full border border-rule bg-surface p-1">
          <button type="button" onClick={() => setMode("browse")} className={`press rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${mode === "browse" ? "bg-brand text-white" : "text-mute hover:text-ink"}`}>
            Browse
          </button>
          <button type="button" onClick={() => setMode("mine")} className={`press rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${mode === "mine" ? "bg-brand text-white" : "text-mute hover:text-ink"}`}>
            My events ({myEvents.length})
          </button>
        </div>
      ) : null}

      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search events, venues…"
          className="w-full rounded-[10px] border border-rule-2 bg-surface py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-start">
        {sportChips.length > 1 ? (
          <FilterGroup label="Sport" className="min-w-[210px] flex-[1.2]" trailing={<ClearLink n={sports.size} onClear={() => setSports(new Set())} />}>
            {sportChips.map((o) => (
              <FacetRow key={o.value} mode="check" active={sports.has(o.value)} onClick={() => setSports((s) => toggleIn(s, o.value))}>
                {o.label}
              </FacetRow>
            ))}
          </FilterGroup>
        ) : null}
        {kindChips.length > 1 ? (
          <FilterGroup label="Type" className="min-w-[190px] flex-1" trailing={<ClearLink n={kinds.size} onClear={() => setKinds(new Set())} />}>
            {kindChips.map((o) => (
              <FacetRow key={o.value} mode="check" active={kinds.has(o.value)} onClick={() => setKinds((s) => toggleIn(s, o.value))}>
                {o.label}
              </FacetRow>
            ))}
          </FilterGroup>
        ) : null}
        <FilterGroup label="When" className="min-w-[170px] flex-[0.9]">
          {[
            { value: "all", label: "Any time" },
            { value: "week", label: "This week" },
            { value: "weekend", label: "This weekend" },
            { value: "month", label: "This month" },
          ].map((o) => (
            <FacetRow key={o.value} mode="radio" active={when === o.value} onClick={() => setWhen(o.value)}>
              {o.label}
            </FacetRow>
          ))}
        </FilterGroup>
        <FilterGroup
          label="Price"
          className="min-w-[180px] flex-[0.9]"
          footer={
            <div className="flex items-center gap-1.5">
              <input
                value={minP}
                onChange={(e) => setMinP(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="Min $"
                aria-label="Minimum price"
                className="h-8 w-full min-w-0 rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
              />
              <span className="text-faint" aria-hidden>–</span>
              <input
                value={maxP}
                onChange={(e) => setMaxP(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="Max $"
                aria-label="Maximum price"
                className="h-8 w-full min-w-0 rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
              />
            </div>
          }
        >
          {[
            { value: "all", label: "Any price" },
            { value: "free", label: "Free" },
            { value: "paid", label: "Paid" },
          ].map((o) => (
            <FacetRow key={o.value} mode="radio" active={price === o.value} onClick={() => setPrice(o.value)}>
              {o.label}
            </FacetRow>
          ))}
        </FilterGroup>
        {/* Proximity — real browser location, honest about unmapped events */}
        <FilterGroup
          label="Near me"
          className="min-w-[220px] flex-[1.1]"
          footer={
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void searchArea();
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  value={areaQ}
                  onChange={(e) => setAreaQ(e.target.value)}
                  placeholder="City or ZIP"
                  aria-label="Search events near a city or ZIP"
                  className="h-8 w-full min-w-0 rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
                />
                <button className="press shrink-0 rounded-full border border-rule-2 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink">Go</button>
              </form>
              {geoErr ? <span className="block pt-1 text-xs text-danger">{geoErr}</span> : null}
            </>
          }
        >
          {[
            { v: null, label: "Off" },
            { v: 5, label: "Within 5 mi" },
            { v: 10, label: "Within 10 mi" },
            { v: 25, label: "Within 25 mi" },
          ].map((o) => (
            <FacetRow key={o.label} mode="radio" active={nearMi === o.v} onClick={() => (o.v === null ? setNearMi(null) : requestNear(o.v))}>
              {o.label}
            </FacetRow>
          ))}
        </FilterGroup>
      </div>

      {/* Map — right under the filters; pins for events linked to located courts */}
      {base.length > 0 ? (
        <div className="mb-5">
          <div className="h-[340px] overflow-hidden rounded-[20px] border border-rule shadow-e1">
            <EventsMap token={mapboxToken} events={filtered} center={geo} centerLabel={geoLabel} radiusMi={nearMi} />
          </div>
          {(() => {
            const pinned = filtered.filter((e) => e.lat != null && e.lng != null).length;
            const unmapped = filtered.length - pinned;
            if (pinned === 0)
              return (
                <p className="mt-1.5 text-[11px] text-faint">
                  No mappable events yet — pins come from an event\u2019s linked court, its Google Maps link, or its venue text. Search a city or ZIP above to explore an area.
                </p>
              );
            if (unmapped > 0)
              return (
                <p className="mt-1.5 text-[11px] text-faint">
                  {unmapped} {unmapped === 1 ? "event doesn\u2019t have" : "events don\u2019t have"} a mappable location, so {unmapped === 1 ? "it appears" : "they appear"} in the list only.
                </p>
              );
            return null;
          })()}
        </div>
      ) : null}

      <p className="mb-3 text-xs text-faint">
        {filtered.length} {filtered.length === 1 ? "event" : "events"}
        {nearMi !== null && geo ? ` within ${nearMi} mi${geoLabel ? ` of ${geoLabel}` : ""}` : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-12 text-center">
          <p className="text-sm font-semibold text-ink">No events match</p>
          <p className="mt-1 text-xs text-mute">Try clearing a filter or your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => {
            const m = sportMeta(e.sportKey);
            const free = isFree(e.costText);
            const full = e.capacity != null && e.goingCount >= e.capacity;
            return (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-rule bg-surface transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(10,10,11,0.3)]"
              >
                <div className="relative aspect-square w-full overflow-hidden">
                  {e.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: gradientFor(e.sportKey) }}>
                      <SportIcon sport={e.sportKey} variant="glyph" size={92} className="drop-shadow-sm" />
                    </div>
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur">{KIND_LABEL[e.kind] ?? "Event"}</span>
                  {mode === "mine" && e.status === "cancelled" ? (
                    <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/80 px-2 py-1 text-[10px] font-bold text-white">Cancelled</span>
                  ) : mode === "mine" && new Date(e.whenIso).getTime() < nowMs ? (
                    <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/55 px-2 py-1 text-[10px] font-bold text-white">Past</span>
                  ) : e.amGoing ? (
                    <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-success px-2 py-1 text-[10px] font-bold text-white">
                      <Check size={11} /> Going
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-ink">{e.title}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-mute">
                    <SportIcon sport={e.sportKey} variant="badge" size={14} /> {m.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-faint">
                    <CalendarDays size={12} className="shrink-0" /> {fmt(e.whenIso, { weekday: "short", month: "short", day: "numeric" })} · {fmt(e.whenIso, { hour: "numeric", minute: "2-digit" })}
                  </p>
                  {e.venue ? (
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-faint">
                      <MapPin size={12} className="shrink-0" /> <span className="truncate">{e.venue}</span>
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="flex items-center gap-1 text-xs text-faint">
                      <Users size={12} /> {e.goingCount}
                      {e.capacity != null ? `/${e.capacity}` : ""}
                      {full ? " · full" : ""}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${free ? "bg-tint-success text-success" : "bg-tint-brand text-brand-deep"}`}>{free ? "Free" : e.costText}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
