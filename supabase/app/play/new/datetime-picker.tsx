"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const STEP = 15; // minutes
const SLOTS = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP); // 0 … 1425

// Module-scope time reads keep the render body lint-clean and only run client-side
// (the popover never renders during SSR).
function nowDate() {
  return new Date();
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(day: Date, minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(h)}:${pad(m)}`;
}
function fmtTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad(m)} ${ap}`;
}
function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function DateTimePicker({ name = "scheduled_at" }: { name?: string }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<Date | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [view, setView] = useState<Date>(() => startOfMonth(nowDate()));

  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);

  // Close on Escape / outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = startOfDay(nowDate());
  const isToday = day ? sameDay(day, today) : false;
  const nowMin = nowDate().getHours() * 60 + nowDate().getMinutes();
  const slotDisabled = (m: number) => isToday && m <= nowMin;

  // Reveal the most relevant time when the column first appears (on open or when
  // the day changes) — not on every slot click, which would feel jumpy.
  useEffect(() => {
    if (!open || !day) return;
    let tM = minutes ?? -1;
    if (tM < 0) tM = isToday ? SLOTS.find((m) => m > nowMin) ?? 1425 : 9 * 60;
    const cont = slotsRef.current;
    const el = cont?.querySelector(`[data-m="${tM}"]`) as HTMLElement | null;
    if (cont && el) cont.scrollTop = el.offsetTop - cont.clientHeight / 2 + el.clientHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, day]);

  const value = day && minutes != null && !slotDisabled(minutes) ? toLocalInput(day, minutes) : "";

  // Calendar grid for the viewed month.
  const first = startOfMonth(view);
  const startDow = first.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  const canPrev = startOfMonth(view).getTime() > startOfMonth(today).getTime();

  function pickDay(d: Date) {
    setDay(d);
    if (minutes != null) {
      const isT = sameDay(d, today);
      if (isT && minutes <= nowMin) setMinutes(null); // chosen time now in the past
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`press flex w-full items-center gap-2.5 rounded-xl border bg-surface py-2.5 pl-3.5 pr-9 text-left text-sm outline-none transition-colors ${open ? "border-brand" : "border-rule hover:border-faint"}`}
      >
        <CalendarDays size={16} className="shrink-0 text-faint" />
        {day && minutes != null && !slotDisabled(minutes) ? (
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {fmtDay(day)} · {fmtTime(minutes)}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-faint">Add a date &amp; time</span>
        )}
      </button>
      {value ? (
        <button
          type="button"
          aria-label="Clear date and time"
          onClick={() => {
            setDay(null);
            setMinutes(null);
          }}
          className="press absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:bg-bg hover:text-ink"
        >
          <X size={14} />
        </button>
      ) : null}

      {open ? (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Choose date and time"
          className="absolute left-0 top-full z-40 mt-2 w-[min(94vw,440px)] origin-top animate-[fade_0.12s_ease-out] overflow-hidden rounded-2xl border border-rule bg-surface shadow-[0_24px_60px_-15px_rgba(10,10,11,0.35)]"
        >
          {/* presets */}
          <div className="flex items-center gap-2 border-b border-rule px-3 py-2.5">
            <button
              type="button"
              onClick={() => {
                setView(startOfMonth(today));
                pickDay(today);
              }}
              className="press rounded-full border border-rule px-3 py-1 text-xs font-semibold text-ink transition-colors hover:bg-bg"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date(today);
                t.setDate(t.getDate() + 1);
                setView(startOfMonth(t));
                pickDay(t);
              }}
              className="press rounded-full border border-rule px-3 py-1 text-xs font-semibold text-ink transition-colors hover:bg-bg"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => {
                setDay(null);
                setMinutes(null);
              }}
              className="ml-auto rounded-full px-2.5 py-1 text-xs font-semibold text-mute transition-colors hover:text-ink"
            >
              Clear
            </button>
          </div>

          <div className="flex flex-col sm:flex-row">
            {/* calendar */}
            <div className="border-b border-rule p-3 sm:flex-1 sm:border-b-0 sm:border-r">
              <div className="mb-2 flex items-center justify-between px-1">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                  aria-label="Previous month"
                  className="press grid h-7 w-7 place-items-center rounded-lg text-mute transition-colors hover:bg-bg disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-ink">
                  {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                  aria-label="Next month"
                  className="press grid h-7 w-7 place-items-center rounded-lg text-mute transition-colors hover:bg-bg"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="grid h-7 place-items-center text-[11px] font-semibold text-faint">
                    {w}
                  </div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={`b${i}`} />;
                  const past = d.getTime() < today.getTime();
                  const sel = day ? sameDay(d, day) : false;
                  const isT = sameDay(d, today);
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={past}
                      aria-pressed={sel}
                      onClick={() => pickDay(d)}
                      className={`relative grid h-9 w-full place-items-center rounded-lg text-sm font-medium transition-colors ${
                        sel
                          ? "bg-brand font-semibold text-white"
                          : past
                            ? "cursor-not-allowed text-faint/40"
                            : "text-ink hover:bg-bg"
                      }`}
                    >
                      {d.getDate()}
                      {isT && !sel ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* time slots */}
            <div className="p-3 sm:w-[150px] sm:shrink-0">
              <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                <Clock size={12} /> Time
              </div>
              {!day ? (
                <p className="px-1 py-6 text-center text-xs text-faint">Pick a date to see times.</p>
              ) : (
                <div ref={slotsRef} className="max-h-[212px] space-y-1 overflow-y-auto pr-1 sm:max-h-[228px]">
                  {SLOTS.every((m) => slotDisabled(m)) ? (
                    <p className="px-1 py-6 text-center text-xs text-faint">No more times today — pick another day.</p>
                  ) : (
                    SLOTS.map((m) => {
                      const dis = slotDisabled(m);
                      const sel = minutes === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          data-m={m}
                          disabled={dis}
                          aria-pressed={sel}
                          onClick={() => setMinutes(m)}
                          className={`w-full rounded-lg px-3 py-1.5 text-center text-[13px] font-medium transition-colors ${
                            sel
                              ? "bg-brand font-semibold text-white"
                              : dis
                                ? "cursor-not-allowed text-faint/40"
                                : "text-ink-soft hover:bg-bg"
                          }`}
                        >
                          {fmtTime(m)}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* footer */}
          <div className="flex items-center gap-3 border-t border-rule bg-bg/50 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-xs">
              {day && minutes != null && !slotDisabled(minutes) ? (
                <span className="font-semibold text-ink">
                  {fmtDay(day)} · {fmtTime(minutes)}
                </span>
              ) : (
                <span className="text-faint">{day ? "Now pick a time" : "No date set"}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-surface transition-colors hover:bg-ink-soft"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}
