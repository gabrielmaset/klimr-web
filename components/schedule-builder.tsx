"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarClock, Printer, Globe } from "lucide-react";
import { Segmented } from "@/components/form-kit";
import { buildSchedule, publishSchedule, unpublishSchedule } from "@/app/tournaments/actions";
import { isoToLocalInput, localInputToIso } from "@/lib/tournament";
import { DateTimeField } from "@/components/date-time-field";

export type ScheduleRow = {
  court: string;
  courtNum: number;
  scheduledAt: string | null;
  division: string;
  pool: string;
  a: string;
  b: string;
};

const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";
const inputCls = "w-full rounded-xl border border-rule bg-surface shadow-e1 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export function ScheduleBuilder({
  tournamentId,
  initStartAt,
  initMode,
  initLength,
  initCourts,
  courtNames,
  built,
  published,
  rows,
  eventTitle,
}: {
  tournamentId: string;
  initStartAt: string | null;
  initMode: "timed" | "ordered";
  initLength: number;
  initCourts: number;
  courtNames: string[];
  built: boolean;
  published: boolean;
  rows: ScheduleRow[];
  eventTitle: string;
}) {
  const router = useRouter();
  const [startAt, setStartAt] = useState(isoToLocalInput(initStartAt));
  const [mode, setMode] = useState<"timed" | "ordered">(initMode);
  const [length, setLength] = useState(String(initLength || 30));
  const [courts, setCourts] = useState(String(initCourts || 1));
  const [busy, setBusy] = useState(false);
  const [pubBusy, setPubBusy] = useState<null | "publish" | "unpublish">(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const byCourt = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const r of rows) {
      const arr = map.get(r.court) ?? [];
      arr.push(r);
      map.set(r.court, arr);
    }
    return [...map.entries()].sort((a, b) => (a[1][0]?.courtNum ?? 0) - (b[1][0]?.courtNum ?? 0));
  }, [rows]);

  async function build() {
    setBusy(true);
    setErr(null);
    setDone(null);
    const res = await buildSchedule(tournamentId, {
      startAt: mode === "timed" && startAt ? localInputToIso(startAt) : null,
      mode,
      matchLengthMin: Number(length) || 30,
      courtCount: courtNames.length || Number(courts) || 1,
    });
    if (res.ok) {
      setDone(`Schedule built — ${res.count} ${res.count === 1 ? "match" : "matches"} placed across courts.`);
      router.refresh();
    } else {
      setErr(res.error ?? "Couldn't build the schedule.");
    }
    setBusy(false);
  }

  async function publish() {
    setPubBusy("publish");
    setErr(null);
    setDone(null);
    const snapMode = rows.some((r) => r.scheduledAt) ? "timed" : "ordered";
    const snapRows = rows.map((r) => ({
      court: r.court,
      time: r.scheduledAt ? fmtTime(r.scheduledAt) : null,
      division: r.division,
      pool: r.pool || null,
      a: r.a,
      b: r.b,
    }));
    const res = await publishSchedule(tournamentId, { mode: snapMode, rows: snapRows });
    if (res.ok) {
      setDone(published ? "Public schedule updated." : "Schedule published to your public event page.");
      router.refresh();
    } else {
      setErr(res.error ?? "Couldn't publish.");
    }
    setPubBusy(null);
  }

  async function unpublish() {
    setPubBusy("unpublish");
    setErr(null);
    setDone(null);
    const res = await unpublishSchedule(tournamentId);
    if (res.ok) {
      setDone("Schedule removed from your public page.");
      router.refresh();
    } else {
      setErr(res.error ?? "Couldn't update.");
    }
    setPubBusy(null);
  }

  function print() {
    const w = window.open("", "_blank", "width=940,height=760");
    if (!w) return;
    const sections = byCourt
      .map(([court, list]) => {
        const trs = list
          .map(
            (r) =>
              `<tr>${mode === "timed" ? `<td class="t">${esc(fmtTime(r.scheduledAt))}</td>` : ""}<td class="m"><b>${esc(r.a)}</b> <span class="v">vs</span> <b>${esc(r.b)}</b></td><td class="d">${esc(r.division)}${r.pool ? " · " + esc(r.pool) : ""}</td></tr>`,
          )
          .join("");
        return `<section><h2>${esc(court)}</h2><table>${mode === "timed" ? '<thead><tr><th class="t">Time</th><th>Match</th><th>Division</th></tr></thead>' : ""}<tbody>${trs}</tbody></table></section>`;
      })
      .join("");
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(eventTitle)} — Schedule</title><style>` +
        `*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0a0a0b;margin:32px;}` +
        `h1{font-size:22px;margin:0 0 2px}p.sub{color:#71717a;margin:0 0 22px;font-size:13px}` +
        `section{margin:0 0 22px;break-inside:avoid}h2{font-size:15px;margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #0a0a0b}` +
        `table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:4px 8px;border-bottom:1px solid #e4e4e7}` +
        `td{padding:6px 8px;border-bottom:1px solid #f1f1f3;vertical-align:top}td.t{width:84px;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}td.d{color:#71717a;text-align:right;white-space:nowrap}.v{color:#a1a1aa;font-weight:400;padding:0 4px}` +
        `@media print{body{margin:14mm}}` +
        `</style></head><body><h1>${esc(eventTitle)}</h1><p class="sub">Match schedule${mode === "timed" ? "" : " — play in listed order per court"}</p>${sections}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
          <CalendarClock size={18} />
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">Build the schedule</h2>
          <p className="mt-0.5 text-sm text-mute">Lay every match out across your courts. Re-run anytime to regenerate.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Time mode</label>
          <Segmented
            ariaLabel="Time mode"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: "timed", label: "Timed slots" },
              { value: "ordered", label: "Ordered per court" },
            ]}
          />
          <p className="mt-1.5 text-xs text-faint">
            {mode === "timed" ? "Each match gets a start time from the start time + match length." : "Matches are listed in play order per court — no fixed clock times."}
          </p>
        </div>

        <div>
          <label className={labelCls}>Courts</label>
          {courtNames.length ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {courtNames.map((c) => (
                  <span key={c} className="rounded-full border border-rule bg-bg px-2.5 py-1 text-xs font-semibold text-ink">{c}</span>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint">{courtNames.length} {courtNames.length === 1 ? "court" : "courts"} from your event setup — matches run in parallel across them. Edit in Settings.</p>
            </>
          ) : (
            <>
              <input inputMode="numeric" value={courts} onChange={(e) => setCourts(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className={inputCls} placeholder="e.g. 4" />
              <p className="mt-1.5 text-xs text-faint">Matches run in parallel across Court 1…{Math.max(1, Number(courts) || 1)}.</p>
            </>
          )}
        </div>

        {mode === "timed" ? (
          <>
            <div>
              <label className={labelCls}>Matches start time</label>
              <DateTimeField value={startAt} onChange={setStartAt} ariaLabel="Matches start" />
              <p className="mt-1.5 text-xs text-faint">When the first matches begin (separate from the event start).</p>
            </div>
            <div>
              <label className={labelCls}>Match length</label>
              <div className="flex items-center gap-2">
                <input inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} className={inputCls} placeholder="30" />
                <span className="text-sm text-mute">min</span>
              </div>
              <p className="mt-1.5 text-xs text-faint">Slot length used to space matches on each court.</p>
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={build}
          disabled={busy}
          className="press inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50 shadow-md shadow-brand/25"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
          {built ? "Rebuild schedule" : "Build schedule"}
        </button>
        {built && rows.length > 0 ? (
          <button type="button" onClick={print} className="press inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-bg">
            <Printer size={15} /> Print
          </button>
        ) : null}
        {built && rows.length > 0 ? (
          <button
            type="button"
            onClick={publish}
            disabled={!!pubBusy}
            className="press inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-bg disabled:opacity-50"
          >
            {pubBusy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}
            {published ? "Update public schedule" : "Publish to public page"}
          </button>
        ) : null}
        {built && published ? (
          <button type="button" onClick={unpublish} disabled={!!pubBusy} className="press inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold text-mute transition hover:text-ink disabled:opacity-50">
            {pubBusy === "unpublish" ? <Loader2 size={15} className="animate-spin" /> : null}
            Unpublish
          </button>
        ) : null}
      </div>
      {err ? <p className="mt-3 text-sm font-semibold text-brand-deep">{err}</p> : null}
      {done ? <p className="mt-3 text-sm font-semibold text-success">{done}</p> : null}
      {published && !done ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-success">
          <Globe size={13} /> Live on your public event page
        </p>
      ) : null}

      {built && byCourt.length > 0 ? (
        <div className="mt-7 border-t border-rule pt-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-mute">Schedule by court</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {byCourt.map(([court, list]) => (
              <div key={court} className="overflow-hidden rounded-2xl border border-rule">
                <p className="border-b border-rule bg-bg/60 px-3 py-2 text-sm font-bold text-ink">{court}</p>
                <ul className="divide-y divide-rule">
                  {list.map((r, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      <span className="w-16 shrink-0 font-mono text-xs font-semibold tabular-nums text-mute">{mode === "timed" ? fmtTime(r.scheduledAt) : `#${i + 1}`}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ink">
                          {r.a} <span className="text-faint">vs</span> {r.b}
                        </span>
                        <span className="mt-0.5 block text-xs text-faint">
                          {r.division}
                          {r.pool ? ` · ${r.pool}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
