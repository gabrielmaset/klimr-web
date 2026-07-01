// Shared helpers for event recurrence — used to keep the "who's going" list fresh.
//
// An event's RSVPs belong to a *cycle*: the run-up to the next occurrence. A "going"
// RSVP is valid until 11:59:59 PM of that occurrence's day, then the list resets so
// people re-RSVP for the next occurrence (the Meetup "stale attendee list" problem).
//
// `rsvpCycleStartMs` returns the cutoff (epoch ms): a going RSVP counts only if it was
// created strictly after this instant. `null` means "no cutoff — count everything"
// (e.g. an upcoming one-time event, or the very first occurrence of a series).

const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 86_400_000;

function endOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Generate occurrence instants within a bounded window around `now` (local time). */
function occurrencesInWindow(start: Date, recurrence: string, days: string[], now: Date): number[] {
  const hh = start.getHours();
  const mm = start.getMinutes();
  const firstMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const winStart = new Date(now.getTime() - 60 * DAY_MS);
  const winEnd = new Date(now.getTime() + 370 * DAY_MS);
  const wanted = new Set(days && days.length ? days : [DOW[start.getDay()]]);
  const startWeekSunday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay()).getTime();

  const out: number[] = [];
  const cursor = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate());
  for (let guard = 0; guard < 2000 && cursor.getTime() <= winEnd.getTime(); guard++, cursor.setDate(cursor.getDate() + 1)) {
    const dayMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime();
    if (dayMidnight < firstMidnight) continue; // nothing before the first date

    let hit = false;
    if (recurrence === "daily") {
      hit = true;
    } else if (recurrence === "monthly") {
      hit = cursor.getDate() === start.getDate();
    } else if (recurrence === "weekly" || recurrence === "biweekly") {
      if (wanted.has(DOW[cursor.getDay()])) {
        if (recurrence === "weekly") {
          hit = true;
        } else {
          const sundayOfCursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay()).getTime();
          const weeks = Math.round((sundayOfCursor - startWeekSunday) / (7 * DAY_MS));
          hit = weeks % 2 === 0;
        }
      }
    }
    if (hit) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hh, mm, 0, 0).getTime());
  }
  return out;
}

export function rsvpCycleStartMs(startsAtISO: string, recurrence: string | null, days: string[], now: Date = new Date()): number | null {
  const start = new Date(startsAtISO);
  if (Number.isNaN(start.getTime())) return null;
  const rec = recurrence || "none";

  if (rec === "none") {
    // One-time event: valid through the event day, then the list clears.
    const eod = endOfDayMs(start);
    return now.getTime() > eod ? eod : null;
  }

  const occ = occurrencesInWindow(start, rec, days, now);
  if (!occ.length) return null;
  occ.sort((a, b) => a - b);

  const nowMs = now.getTime();
  const upcomingIdx = occ.findIndex((ms) => endOfDayMs(new Date(ms)) >= nowMs);
  if (upcomingIdx === -1) return endOfDayMs(new Date(occ[occ.length - 1])); // whole series is in the past
  if (upcomingIdx === 0) return null; // upcoming is the earliest we can see — count everything recent
  return endOfDayMs(new Date(occ[upcomingIdx - 1])); // cutoff = end of the previous occurrence
}

/** Convenience for SQL filtering: cycle start as an ISO string (or null). */
export function rsvpCycleStartISO(startsAtISO: string, recurrence: string | null, days: string[], now: Date = new Date()): string | null {
  const ms = rsvpCycleStartMs(startsAtISO, recurrence, days, now);
  return ms == null ? null : new Date(ms).toISOString();
}
