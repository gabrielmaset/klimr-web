"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, MapPin, Search, Users, GraduationCap } from "lucide-react";
import { FilterGroup, FacetRow } from "@/components/filter-chips";
import { sportMeta, sportSlug } from "@/lib/sports";
import { formatClassPrice } from "@/lib/classes";
import { LocalTime } from "@/components/local-time";

export type BrowseClass = {
  id: string;
  title: string;
  sportKey: string;
  summary: string | null;
  isPaid: boolean;
  priceCents: number;
  priceBasis: string;
  recurrence: string;
  locationName: string | null;
  format: string;
  levelMin: number | null;
  levelMax: number | null;
  nextStart: string | null;
  coachName: string | null;
  spotsLeft: number | null;
};

const LEVEL_NAMES = ["", "Beginner", "Intermediate", "Advanced", "Expert"];
function levelLabel(min: number | null, max: number | null): string | null {
  const a = min != null ? LEVEL_NAMES[min] : null;
  const b = max != null ? LEVEL_NAMES[max] : null;
  if (a && b && a !== b) return `${a}–${b}`;
  if (a || b) return a ?? b;
  return "All levels";
}
const FORMAT_LABEL: Record<string, string> = { group_class: "Group class", private_lesson: "Private lesson", clinic: "Clinic", workshop: "Workshop", camp: "Camp", open_play: "Open play" };

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

function Card({ c }: { c: BrowseClass }) {
  const m = sportMeta(c.sportKey);
  const lvl = levelLabel(c.levelMin, c.levelMax);
  return (
    <Link href={`/classes/${c.id}`} className="lift block rounded-2xl border border-rule bg-surface p-4 shadow-e1">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(c.sportKey)}) 16%, transparent)` }} aria-hidden>
          {m.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="kicker text-brand-deep">{m.name}</span>
            <span className="kicker text-faint">· {FORMAT_LABEL[c.format] ?? c.format}</span>
            {c.recurrence === "recurring" ? <span className="kicker text-faint">· Weekly</span> : null}
          </div>
          <div className="truncate text-sm font-bold text-ink">{c.title}</div>
          <div className="truncate text-xs text-mute">
            {c.coachName ? <>with <span className="font-semibold text-ink-soft">{c.coachName}</span></> : c.summary}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-ink">
          {formatClassPrice(c.isPaid, c.priceCents, c.priceBasis)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
        {lvl ? <span className="rounded-full border border-rule px-2 py-0.5 font-semibold text-ink-soft">{lvl}</span> : null}
        {c.nextStart ? (
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> <LocalTime iso={c.nextStart} /></span>
        ) : (
          <span className="text-faint">No upcoming sessions</span>
        )}
        {c.spotsLeft != null ? (
          <span className={`inline-flex items-center gap-1.5 ${c.spotsLeft === 0 ? "text-faint" : c.spotsLeft <= 2 ? "font-semibold text-brand-deep" : ""}`}>
            <Users size={13} /> {c.spotsLeft === 0 ? "Full — waitlist" : `${c.spotsLeft} spot${c.spotsLeft === 1 ? "" : "s"} left`}
          </span>
        ) : null}
        {c.locationName ? <span className="inline-flex items-center gap-1.5"><MapPin size={13} /> {c.locationName}</span> : null}
      </div>
    </Link>
  );
}

/** The Classes & Coaching browser — the Training Room's facet-deck grammar
 *  tuned for coaching: sport (multi), format (private/group/clinic), level,
 *  schedule, price with a range, and a search that also matches coach names. */
export function ClassesBrowser({ items, nowMs }: { items: BrowseClass[]; nowMs: number }) {
  const [q, setQ] = useState("");
  const [sports, setSports] = useState<Set<string>>(new Set());
  const [fmt, setFmt] = useState("all");
  const [level, setLevel] = useState("all");
  const [when, setWhen] = useState("all");
  const [price, setPrice] = useState("all");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");

  const allSports = useMemo(() => [...new Set(items.map((c) => c.sportKey))], [items]);
  const allFormats = useMemo(() => [...new Set(items.map((c) => c.format))], [items]);

  const shown = useMemo(() => {
    const now = nowMs;
    const week = now + 7 * 86400_000;
    const month = now + 31 * 86400_000;
    return items.filter((c) => {
      if (sports.size > 0 && !sports.has(c.sportKey)) return false;
      if (fmt !== "all" && c.format !== fmt) return false;
      if (level !== "all") {
        const n = Number(level);
        const lo = c.levelMin ?? 1;
        const hi = c.levelMax ?? 4;
        if (n < lo || n > hi) return false;
      }
      if (when !== "all") {
        if (!c.nextStart) return false;
        const t = Date.parse(c.nextStart);
        if (when === "week" && t > week) return false;
        if (when === "month" && t > month) return false;
      }
      if (price === "free" && c.isPaid) return false;
      if (price === "paid" && !c.isPaid) return false;
      const minV = minP.trim() ? parseFloat(minP) * 100 : null;
      const maxV = maxP.trim() ? parseFloat(maxP) * 100 : null;
      if (minV != null || maxV != null) {
        const cents = c.isPaid ? c.priceCents : 0;
        if (minV != null && cents < minV) return false;
        if (maxV != null && cents > maxV) return false;
      }
      if (q.trim()) {
        const hay = `${c.title} ${c.summary ?? ""} ${c.coachName ?? ""} ${c.locationName ?? ""} ${sportMeta(c.sportKey).name}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [items, nowMs, q, sports, fmt, level, when, price, minP, maxP]);

  const priceInput = "h-8 w-full min-w-0 rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand";

  return (
    <div>
      <label className="relative mb-3 block">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search classes, coaches, venues…"
          className="h-11 w-full rounded-full border border-rule bg-surface pl-10 pr-4 text-sm text-ink shadow-e1 outline-none placeholder:text-faint focus:border-brand"
        />
      </label>

      <div className="mb-6 flex flex-wrap items-start gap-3">
        {allSports.length > 1 ? (
          <FilterGroup label="Sport" className="min-w-[200px] flex-[1.1]" trailing={<ClearLink n={sports.size} onClear={() => setSports(new Set())} />}>
            {allSports.map((k) => (
              <FacetRow key={k} mode="check" active={sports.has(k)} onClick={() => setSports((s) => toggleIn(s, k))}>
                {sportMeta(k).emoji} {sportMeta(k).name}
              </FacetRow>
            ))}
          </FilterGroup>
        ) : null}
        {allFormats.length > 1 ? (
          <FilterGroup label="Format" className="min-w-[170px] flex-[0.9]">
            {[{ v: "all", l: "Any format" }, ...allFormats.map((f) => ({ v: f, l: FORMAT_LABEL[f] ?? f }))].map((o) => (
              <FacetRow key={o.v} mode="radio" active={fmt === o.v} onClick={() => setFmt(o.v)}>
                {o.l}
              </FacetRow>
            ))}
          </FilterGroup>
        ) : null}
        <FilterGroup label="Level" className="min-w-[170px] flex-[0.9]">
          {[
            { v: "all", l: "All levels" },
            { v: "1", l: "Beginner" },
            { v: "2", l: "Intermediate" },
            { v: "3", l: "Advanced" },
            { v: "4", l: "Expert" },
          ].map((o) => (
            <FacetRow key={o.v} mode="radio" active={level === o.v} onClick={() => setLevel(o.v)}>
              {o.l}
            </FacetRow>
          ))}
        </FilterGroup>
        <FilterGroup label="Starts" className="min-w-[160px] flex-[0.8]">
          {[
            { v: "all", l: "Anytime" },
            { v: "week", l: "This week" },
            { v: "month", l: "This month" },
          ].map((o) => (
            <FacetRow key={o.v} mode="radio" active={when === o.v} onClick={() => setWhen(o.v)}>
              {o.l}
            </FacetRow>
          ))}
        </FilterGroup>
        <FilterGroup
          label="Price"
          className="min-w-[180px] flex-[0.9]"
          footer={
            <div className="flex items-center gap-1.5">
              <input value={minP} onChange={(e) => setMinP(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Min $" aria-label="Minimum price" className={priceInput} />
              <span className="text-faint" aria-hidden>–</span>
              <input value={maxP} onChange={(e) => setMaxP(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Max $" aria-label="Maximum price" className={priceInput} />
            </div>
          }
        >
          {[
            { v: "all", l: "Any price" },
            { v: "free", l: "Free" },
            { v: "paid", l: "Paid" },
          ].map((o) => (
            <FacetRow key={o.v} mode="radio" active={price === o.v} onClick={() => setPrice(o.v)}>
              {o.l}
            </FacetRow>
          ))}
        </FilterGroup>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center shadow-e1">
          <GraduationCap size={28} className="mx-auto text-faint" />
          <p className="mt-2 text-sm text-mute">{items.length === 0 ? "No classes are published yet. Check back soon." : "Nothing matches those filters — try widening them."}</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
