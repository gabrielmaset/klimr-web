"use client";

import { useState } from "react";
import { CalendarClock, CalendarOff, CalendarCheck2, PauseCircle, PlayCircle } from "lucide-react";
import { DangerConfirm } from "@/components/danger-confirm";
import { skipOccurrence, unskipOccurrence, pauseSeries, resumeSeries, endSeries } from "@/app/events/actions";

type Occ = { date: string; label: string; status: string; skipNote: string | null };

/** Organizer schedule & liveness controls (Event Pulse, shadow phase).
 *  Skip a date (with an optional note), pause the whole series until a date,
 *  resume, or end the series. Everything lands in the audited RPCs from
 *  migration 0130 — the panel is deliberately thin. */
export function EventLivenessPanel({
  eventId,
  recurrence,
  organizerState,
  pausedUntil,
  occurrences,
  minPauseDate,
}: {
  eventId: string;
  recurrence: string;
  organizerState: string;
  pausedUntil: string | null;
  occurrences: Occ[];
  minPauseDate: string;
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const recurring = recurrence !== "none";
  if (!recurring) return null;

  const paused = organizerState === "paused";
  const ended = organizerState === "ended";
  const pausedLabel = pausedUntil
    ? new Date(pausedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="flex h-full flex-col rounded-3xl border border-rule bg-surface p-5 shadow-e1">
      <div className="flex items-center gap-2.5">
        <CalendarClock size={15} className="text-brand-deep" />
        <p className="kicker">Schedule &amp; liveness</p>
      </div>

      {ended ? (
        <div className="mt-3 rounded-2xl border border-rule bg-tint p-3 text-sm text-mute">
          This series has ended — no new dates are scheduled.
          <form action={resumeSeries} className="mt-2">
            <input type="hidden" name="eventId" value={eventId} />
            <button className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:opacity-90">
              <PlayCircle size={13} /> Restart the series
            </button>
          </form>
        </div>
      ) : (
        <>
          {paused ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-warning/30 bg-tint-warning p-3">
              <p className="text-sm text-ink">
                Paused{pausedLabel ? ` until ${pausedLabel}` : ""} — dates in the window are skipped, never counted
                against the series.
              </p>
              <form action={resumeSeries}>
                <input type="hidden" name="eventId" value={eventId} />
                <button className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:opacity-90">
                  <PlayCircle size={13} /> Resume
                </button>
              </form>
            </div>
          ) : null}

          <ul className="mt-3 space-y-1.5">
            {occurrences.map((o) => {
              const skipped = o.status === "skipped";
              const open = noteFor === o.date;
              return (
                <li key={o.date} className="rounded-2xl border border-rule bg-tint px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {o.label}
                      {skipped ? (
                        <span className="ml-2 text-xs font-semibold text-warning">
                          Skipped{o.skipNote ? ` · ${o.skipNote}` : ""}
                        </span>
                      ) : null}
                    </span>
                    {skipped ? (
                      <form action={unskipOccurrence}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="date" value={o.date} />
                        <button className="press inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-cream">
                          <CalendarCheck2 size={12} /> Restore
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNoteFor(open ? null : o.date)}
                        className="press inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-cream"
                      >
                        <CalendarOff size={12} /> Skip
                      </button>
                    )}
                  </div>
                  {open && !skipped ? (
                    <form action={skipOccurrence} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="date" value={o.date} />
                      <input
                        name="note"
                        maxLength={140}
                        placeholder="Why? (optional — shown to players)"
                        className="w-full rounded-full border border-rule bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:outline-none"
                      />
                      <button className="press shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:opacity-90">
                        Skip date
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
            {occurrences.length === 0 ? (
              <li className="rounded-2xl border border-rule bg-tint px-3 py-2 text-sm text-mute">
                No upcoming dates in view.
              </li>
            ) : null}
          </ul>

          {!paused ? (
            <form action={pauseSeries} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="eventId" value={eventId} />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-mute">
                <PauseCircle size={13} /> Pause until
              </label>
              <input
                type="date"
                name="until"
                required
                min={minPauseDate}
                className="rounded-full border border-rule bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none"
              />
              <button className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream">
                Pause series
              </button>
            </form>
          ) : null}

          <div className="mt-3 border-t border-rule pt-3">
            <DangerConfirm
              word="CANCEL"
              triggerLabel="End this series"
              triggerClassName="press inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:bg-tint"
              heading="End this recurring series?"
              description="No new dates will be scheduled and upcoming dates are cancelled. Past occurrences and their history are kept."
              consequences={["Upcoming dates are cancelled for everyone", "The event stops repeating", "You can restart it later from this panel"]}
              confirmLabel="End series"
              onConfirm={() => endSeries(eventId)}
            />
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] leading-snug text-faint">
        Skipped and paused dates never count against your event&rsquo;s activity record.
      </p>
    </div>
  );
}
