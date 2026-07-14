import Link from "next/link";

export type HistoryRow = { id: string; href: string; emoji: string; title: string; sub: string; role: string; cancelled: boolean };

/** The shared past-items list used by /events/past, /classes/past, and /tournaments/past. */
export function HistoryList({ rows, emptyText }: { rows: HistoryRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-rule bg-surface px-5 py-12 text-center text-sm text-mute">{emptyText}</div>;
  }
  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <Link key={r.id} href={r.href} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bg text-lg">{r.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-ink">{r.title}</span>
              {r.cancelled ? <span className="shrink-0 rounded-full bg-[#fef2f2] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#dc2626]">Cancelled</span> : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-mute">{r.sub}</span>
          </span>
          <span className="shrink-0 rounded-full border border-rule px-2.5 py-1 text-[11px] font-semibold text-ink-soft">{r.role}</span>
        </Link>
      ))}
    </div>
  );
}
