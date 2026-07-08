"use client";

import { useMemo, useState } from "react";
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
const gradientFor = (sportKey: string) => {
  const h = SPORT_HUE[sportKey] ?? 210;
  return `linear-gradient(140deg, hsl(${h} 72% 90%), hsl(${(h + 30) % 360} 74% 80%))`;
};

type Chip = { value: string; label: string };
function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Chip[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              on ? "border-brand bg-brand text-white" : "border-rule bg-surface text-mute hover:border-brand/50 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EventsBrowser({ events, myEvents = [], nowMs }: { events: CardEvent[]; myEvents?: CardEvent[]; nowMs: number }) {
  const [mode, setMode] = useState<"browse" | "mine">("browse");
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("all");
  const [kind, setKind] = useState("all");
  const [price, setPrice] = useState("all");
  const [when, setWhen] = useState("all");

  const base = mode === "mine" ? myEvents : events;
  const sports = useMemo(() => [...new Set(base.map((e) => e.sportKey))], [base]);
  const kinds = useMemo(() => [...new Set(base.map((e) => e.kind))], [base]);

  const filtered = useMemo(() => {
    const day = 86400000;
    return base.filter((e) => {
      if (sport !== "all" && e.sportKey !== sport) return false;
      if (kind !== "all" && e.kind !== kind) return false;
      if (price === "free" && !isFree(e.costText)) return false;
      if (price === "paid" && isFree(e.costText)) return false;
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
      if (q.trim()) {
        const hay = `${e.title} ${e.venue ?? ""} ${KIND_LABEL[e.kind] ?? ""} ${sportMeta(e.sportKey).name}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [base, q, sport, kind, price, when, nowMs]);

  const sportChips: Chip[] = [{ value: "all", label: "All sports" }, ...sports.map((s) => ({ value: s, label: `${sportMeta(s).emoji} ${sportMeta(s).name}` }))];
  const kindChips: Chip[] = [{ value: "all", label: "All types" }, ...kinds.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))];

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

      <div className="mb-6 space-y-2.5">
        {sportChips.length > 2 ? <Chips value={sport} onChange={setSport} options={sportChips} /> : null}
        {kindChips.length > 2 ? <Chips value={kind} onChange={setKind} options={kindChips} /> : null}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <Chips
            value={when}
            onChange={setWhen}
            options={[
              { value: "all", label: "Any time" },
              { value: "week", label: "This week" },
              { value: "weekend", label: "This weekend" },
              { value: "month", label: "This month" },
            ]}
          />
          <Chips
            value={price}
            onChange={setPrice}
            options={[
              { value: "all", label: "Any price" },
              { value: "free", label: "Free" },
              { value: "paid", label: "Paid" },
            ]}
          />
        </div>
      </div>

      <p className="mb-3 text-xs text-faint">
        {filtered.length} {filtered.length === 1 ? "event" : "events"}
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
                      <span className="text-6xl drop-shadow-sm">{m.emoji}</span>
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
                    <span>{m.emoji}</span> {m.name}
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
