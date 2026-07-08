"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import type { CalEvent, CalKind } from "@/lib/calendar";

// ---- palette ---------------------------------------------------------------
const KIND: Record<CalKind, { label: string; fill: string; dot: string }> = {
  match: { label: "Matches", fill: "#ea580c", dot: "#ea580c" },
  event: { label: "Events", fill: "#2563eb", dot: "#2563eb" },
  class: { label: "Classes", fill: "#7c3aed", dot: "#7c3aed" },
  tournament: { label: "Tournaments", fill: "#d97706", dot: "#d97706" },
};
const KIND_ORDER: CalKind[] = ["match", "event", "class", "tournament"];

// ---- date helpers (native Date, local time) --------------------------------
const HOUR_H = 48; // px per hour in the week/day grids
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addMonths = (d: Date, n: number) => {
  const x = startOfDay(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
};
const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
};
const startOfMonth = (d: Date) => {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
};
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const fmtTime = (d: Date) => {
  const h = d.getHours();
  const m = d.getMinutes();
  const ap = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")} ${ap}` : `${hr} ${ap}`;
};
const fmtHour = (h: number) => {
  const ap = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ap}`;
};

// ---- event enrichment + overlap layout -------------------------------------
type Ev = CalEvent & { s: Date; e: Date; startMin: number; endMin: number };

function enrich(ev: CalEvent): Ev {
  const s = new Date(ev.start);
  const e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 90 * 60000);
  const endD = e > s ? e : new Date(s.getTime() + 90 * 60000);
  const startMin = s.getHours() * 60 + s.getMinutes();
  let endMin: number;
  if (ev.allDay) endMin = startMin;
  else if (!isSameDay(s, endD)) endMin = 24 * 60;
  else endMin = endD.getHours() * 60 + endD.getMinutes();
  endMin = Math.max(endMin, startMin + 30);
  return { ...ev, s, e: endD, startMin, endMin };
}

type Placed = { ev: Ev; col: number; cols: number };
// Greedy column packing: overlapping events share a cluster and split the width.
function placeDay(evs: Ev[]): Placed[] {
  const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const res: Placed[] = [];
  let group: { ev: Ev; col: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = group.reduce((m, g) => Math.max(m, g.col), 0) + 1;
    for (const g of group) res.push({ ev: g.ev, col: g.col, cols });
    group = [];
    groupEnd = -1;
  };
  for (const ev of sorted) {
    if (group.length && ev.startMin >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.ev.endMin > ev.startMin).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ev, col });
    groupEnd = Math.max(groupEnd, ev.endMin);
  }
  if (group.length) flush();
  return res;
}

// ===========================================================================
export function CalendarView({ events, nowIso }: { events: CalEvent[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date(nowIso)));

  const enriched = useMemo(() => events.map(enrich), [events]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)), [cursor]);

  const go = (dir: number) =>
    setCursor((c) => (view === "month" ? addMonths(c, dir) : view === "week" ? addDays(c, 7 * dir) : addDays(c, dir)));
  const goToday = () => setCursor(startOfDay(new Date()));
  const openDay = (d: Date) => {
    setCursor(startOfDay(d));
    setView("day");
  };

  const title =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "day"
        ? cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : (() => {
            const ws = startOfWeek(cursor);
            const we = addDays(ws, 6);
            return ws.getMonth() === we.getMonth()
              ? `${ws.toLocaleDateString("en-US", { month: "long" })} ${ws.getDate()}–${we.getDate()}, ${we.getFullYear()}`
              : `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${we.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${we.getFullYear()}`;
          })();

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <CalendarRange size={20} className="text-brand" />
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Calendar</h1>
      </div>
      <p className="mb-5 text-sm text-mute">Every match, event, class, and tournament you&rsquo;re part of, in one place.</p>

      {/* toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goToday} className="press rounded-full border border-rule bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-bg">
            Today
          </button>
          <div className="flex items-center">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="press grid h-8 w-8 place-items-center rounded-full text-mute transition-colors hover:bg-bg hover:text-ink">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="press grid h-8 w-8 place-items-center rounded-full text-mute transition-colors hover:bg-bg hover:text-ink">
              <ChevronRight size={18} />
            </button>
          </div>
          <h2 className="font-display text-xl leading-none text-ink sm:text-2xl">{title}</h2>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="hidden items-center gap-3 lg:flex">
            {KIND_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-mute">
                <span className="h-2 w-2 rounded-full" style={{ background: KIND[k].dot }} /> {KIND[k].label}
              </span>
            ))}
          </div>
          <div className="inline-flex rounded-full border border-rule bg-surface p-0.5">
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${view === v ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid events={enriched} cursor={cursor} now={now} onOpenDay={openDay} />
      ) : (
        <TimeGrid key={view} events={enriched} days={view === "week" ? weekDays : [startOfDay(cursor)]} now={now} />
      )}
    </div>
  );
}

// ---- month view ------------------------------------------------------------
function MonthGrid({ events, cursor, now, onOpenDay }: { events: Ev[]; cursor: Date; now: Date; onOpenDay: (d: Date) => void }) {
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEndWeek = startOfWeek(endOfMonth(cursor));
  const weeks = Math.round((gridEndWeek.getTime() - gridStart.getTime()) / (7 * DAY_MS)) + 1;
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const byDay = new Map<string, Ev[]>();
  for (const ev of events) {
    let d = startOfDay(ev.s);
    const last = startOfDay(ev.e);
    let guard = 0;
    while (d <= last && guard < 45) {
      const k = dayKey(d);
      const arr = byDay.get(k);
      if (arr) arr.push(ev);
      else byDay.set(k, [ev]);
      d = addDays(d, 1);
      guard++;
    }
  }
  for (const arr of byDay.values()) arr.sort((a, b) => (a.allDay === b.allDay ? a.startMin - b.startMin : a.allDay ? -1 : 1));

  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
      <div className="grid grid-cols-7 border-b border-rule bg-bg/50">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-faint">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, now);
          const dayEvents = byDay.get(dayKey(d)) ?? [];
          const shown = dayEvents.slice(0, 3);
          const extra = dayEvents.length - shown.length;
          return (
            <div
              key={i}
              className={`min-h-[94px] border-b border-r border-rule p-1 sm:min-h-[118px] sm:p-1.5 ${i % 7 === 6 ? "border-r-0" : ""} ${i >= days.length - 7 ? "border-b-0" : ""} ${inMonth ? "" : "bg-bg/40"}`}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold transition-colors ${
                  isToday ? "bg-brand text-white" : inMonth ? "text-ink hover:bg-bg" : "text-faint hover:bg-bg"
                }`}
              >
                {d.getDate()}
              </button>
              <div className="mt-1 space-y-0.5">
                {shown.map((ev) => (
                  <MonthChip key={ev.key} ev={ev} />
                ))}
                {extra > 0 ? (
                  <button type="button" onClick={() => onOpenDay(d)} className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-mute hover:bg-bg">
                    +{extra} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthChip({ ev }: { ev: Ev }) {
  const k = KIND[ev.kind];
  return (
    <Link href={ev.href} title={ev.title} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight transition-colors hover:bg-bg">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: k.dot }} />
      {!ev.allDay ? <span className="shrink-0 tabular-nums text-mute">{fmtTime(ev.s)}</span> : null}
      <span className="truncate font-medium text-ink">{ev.title}</span>
    </Link>
  );
}

// ---- week / day view (time grid) -------------------------------------------
function TimeGrid({ events, days, now }: { events: Ev[]; days: Date[]; now: Date }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H - 8; // open around 7am
  }, []);

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const allDayByDay = days.map((d) => events.filter((ev) => ev.allDay && isSameDay(ev.s, d)));
  const hasAllDay = allDayByDay.some((a) => a.length > 0);
  const timedByDay = days.map((d) => placeDay(events.filter((ev) => !ev.allDay && isSameDay(ev.s, d))));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const gutter = "3.25rem";

  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
      {/* day header */}
      <div className="flex border-b border-rule">
        <div className="shrink-0" style={{ width: gutter }} />
        {days.map((d, i) => {
          const isToday = isSameDay(d, now);
          return (
            <div key={i} className="flex-1 border-l border-rule px-1 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{WEEKDAYS[d.getDay()]}</div>
              <div className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full font-display text-lg leading-none ${isToday ? "bg-brand text-white" : "text-ink"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* all-day row */}
      {hasAllDay ? (
        <div className="flex border-b border-rule bg-bg/30">
          <div className="flex shrink-0 items-center justify-end pr-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint" style={{ width: gutter }}>
            All-day
          </div>
          {days.map((d, i) => (
            <div key={i} className="flex-1 space-y-1 border-l border-rule p-1">
              {allDayByDay[i].map((ev) => (
                <Link key={ev.key} href={ev.href} title={ev.title} className="block truncate rounded-md px-1.5 py-1 text-[11px] font-semibold text-white" style={{ background: KIND[ev.kind].fill }}>
                  {ev.title}
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* scrollable time grid */}
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="relative flex" style={{ height: 24 * HOUR_H }}>
          {/* hour gutter */}
          <div className="shrink-0" style={{ width: gutter }}>
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_H }}>
                <span className="absolute right-1.5 -top-2 text-[10px] text-faint">{h === 0 ? "" : fmtHour(h)}</span>
              </div>
            ))}
          </div>
          {/* day columns */}
          {days.map((d, i) => (
            <div key={i} className="relative flex-1 border-l border-rule">
              {hours.map((h) => (
                <div key={h} className="border-b border-rule/60" style={{ height: HOUR_H }} />
              ))}
              {isSameDay(d, now) ? (
                <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (nowMin / 60) * HOUR_H }}>
                  <div className="relative h-px bg-[#ef4444]">
                    <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-[#ef4444]" />
                  </div>
                </div>
              ) : null}
              {timedByDay[i].map(({ ev, col, cols }) => {
                const top = (ev.startMin / 60) * HOUR_H;
                const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_H, 18);
                const widthPct = 100 / cols;
                const k = KIND[ev.kind];
                return (
                  <Link
                    key={ev.key}
                    href={ev.href}
                    title={`${ev.title} · ${fmtTime(ev.s)}`}
                    className="absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-white ring-1 ring-black/10 transition-transform hover:z-30 hover:brightness-105"
                    style={{ top, height, left: `calc(${col * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, background: k.fill }}
                  >
                    <div className="truncate font-semibold">{ev.title}</div>
                    {height > 30 ? <div className="truncate text-white/85">{fmtTime(ev.s)}</div> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
