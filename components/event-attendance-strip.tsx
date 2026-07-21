import { CheckCircle2, CalendarOff } from "lucide-react";

export type AttendanceStripItem = {
  key: string;
  dateLabel: string;
  kind: "played" | "skipped";
  label: string; // "12 played" · "5–9 played" · "Played" · "Skipped"
  note: string | null;
};

/** Public verified-attendance strip (Event Pulse, behind `attendance_strip_public`).
 *  Shows only closed history — occurrences publish after the finalization grace,
 *  so the strip is delayed by design. Counts follow the confirmed privacy
 *  cutoffs: below four the number is suppressed (the chip just says "Played"),
 *  4–9 renders as a range, ten and up is exact. Empty occurrences are simply
 *  omitted — this strip is proof of life, not a shame ledger; dormancy has its
 *  own machinery. Skipped dates appear with the organizer's note so gaps read
 *  as intentional. */
export function EventAttendanceStrip({ items }: { items: AttendanceStripItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-5 rounded-2xl border border-rule bg-bg px-4 py-3">
      <p className="kicker mb-2 text-faint">Recent sessions · verified at the court</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
          >
            {it.kind === "played" ? (
              <CheckCircle2 size={13} className="text-success" />
            ) : (
              <CalendarOff size={13} className="text-faint" />
            )}
            <span className="text-mute">{it.dateLabel}</span>
            <span>·</span>
            <span>{it.label}</span>
            {it.note ? <span className="font-normal text-mute">— {it.note}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
