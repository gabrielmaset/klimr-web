"use client";

import { useMemo, useRef, useState } from "react";
import { SportIcon } from "@/components/sport-icons";
import { TrendingUp } from "lucide-react";
import { sportMeta, sportSlug } from "@/lib/sports";

export type HistoryPoint = { week: string; points: number; rank: number | null };

type Props = {
  bySport: Record<string, HistoryPoint[]>;
  nowMs: number;
};

const W = 720;
const H = 232;
const PAD = { l: 44, r: 16, t: 18, b: 30 };

function weekMs(week: string) {
  return Date.parse(week + "T00:00:00Z");
}

/** Smooth cubic path through points (Catmull-Rom → bezier). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) out.push(Math.round(v));
  return out;
}

/** The profile's permanent record: weekly points (area) or ladder position
 *  (line, inverted — up is better), per sport, since the member's first
 *  result. The ladder forgets inactive players after 180 days; this never
 *  does. */
export function RankHistoryChart({ bySport, nowMs }: Props) {
  const sports = useMemo(
    () => Object.keys(bySport).sort((a, b) => (bySport[b].at(-1)?.points ?? 0) - (bySport[a].at(-1)?.points ?? 0)),
    [bySport],
  );
  const [sport, setSport] = useState(sports[0] ?? "tennis");
  const [view, setView] = useState<"points" | "rank">("points");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const raw = useMemo(() => bySport[sport] ?? [], [bySport, sport]);

  // Zero-fill missing weeks so pauses read honestly as valleys.
  const series = useMemo(() => {
    if (raw.length === 0) return [] as HistoryPoint[];
    const byWeek = new Map(raw.map((r) => [r.week, r]));
    const start = weekMs(raw[0].week);
    const out: HistoryPoint[] = [];
    for (let t = start; t <= nowMs; t += 7 * 86400_000) {
      const key = new Date(t).toISOString().slice(0, 10);
      out.push(byWeek.get(key) ?? { week: key, points: 0, rank: null });
    }
    return out;
  }, [raw, nowMs]);

  const rankSeries = useMemo(() => series.filter((s) => s.rank != null), [series]);
  const data = view === "points" ? series : rankSeries;

  const geom = useMemo(() => {
    if (data.length === 0) return null;
    const x0 = weekMs(data[0].week);
    const x1 = Math.max(weekMs(data[data.length - 1].week), x0 + 6 * 7 * 86400_000);
    const xOf = (w: string) => PAD.l + ((weekMs(w) - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
    let yOf: (v: number) => number;
    let ticks: number[];
    if (view === "points") {
      const max = Math.max(10, ...series.map((s) => s.points));
      ticks = niceTicks(max);
      const top = ticks[ticks.length - 1];
      yOf = (v) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
    } else {
      const best = Math.min(...rankSeries.map((s) => s.rank!));
      const worst = Math.max(...rankSeries.map((s) => s.rank!));
      const lo = Math.max(1, best);
      const hi = Math.max(worst, lo + 3);
      ticks = [lo, Math.round((lo + hi) / 2), hi];
      yOf = (v) => PAD.t + ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b); // inverted: rank 1 on top
    }
    const pts = data.map((s) => ({ x: xOf(s.week), y: yOf(view === "points" ? s.points : (s.rank as number)) }));
    // adaptive x labels: months < 15mo, otherwise years
    const spanMonths = (x1 - x0) / (30.44 * 86400_000);
    const xLabels: { x: number; label: string }[] = [];
    const d0 = new Date(x0);
    if (spanMonths <= 15) {
      const cur = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1));
      while (cur.getTime() <= x1) {
        if (cur.getTime() >= x0) xLabels.push({ x: PAD.l + ((cur.getTime() - x0) / (x1 - x0)) * (W - PAD.l - PAD.r), label: cur.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
        cur.setUTCMonth(cur.getUTCMonth() + (spanMonths > 8 ? 2 : 1));
      }
    } else {
      const cur = new Date(Date.UTC(d0.getUTCFullYear() + 1, 0, 1));
      while (cur.getTime() <= x1) {
        xLabels.push({ x: PAD.l + ((cur.getTime() - x0) / (x1 - x0)) * (W - PAD.l - PAD.r), label: String(cur.getUTCFullYear()) });
        cur.setUTCFullYear(cur.getUTCFullYear() + 1);
      }
    }
    return { pts, ticks, yOf, xLabels };
  }, [data, series, rankSeries, view]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!geom || data.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    geom.pts.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  }

  const latest = series.at(-1);
  const peak = useMemo(() => series.reduce((a, b) => (b.points > a.points ? b : a), { week: "", points: 0, rank: null as number | null }), [series]);
  const bestRank = useMemo(() => rankSeries.reduce<number | null>((a, b) => (a == null || (b.rank as number) < a ? (b.rank as number) : a), null), [rankSeries]);

  if (sports.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-rule-2 bg-surface/60 p-8 text-center">
        <TrendingUp size={24} className="mx-auto text-faint" />
        <p className="mt-2 text-sm font-bold text-ink">No ranking history yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-mute">Play a queue night or finish a tournament — the climb gets charted here, week by week, for good.</p>
      </div>
    );
  }

  const hoverPt = hover != null && geom ? geom.pts[Math.min(hover, geom.pts.length - 1)] : null;
  const hoverRow = hover != null ? data[Math.min(hover, data.length - 1)] : null;

  return (
    <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {sports.map((k) => {
          const m = sportMeta(k);
          const on = k === sport;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSport(k);
                setHover(null);
              }}
              className={`press rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${on ? "border-transparent text-ink" : "border-rule-2 bg-surface text-mute"}`}
              style={on ? { background: `color-mix(in oklab, var(--color-sport-${sportSlug(k)}) 20%, transparent)` } : undefined}
            >
              <SportIcon sport={k} variant="badge" size={13} className="mr-1" />{m.name}
            </button>
          );
        })}
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-rule-2">
          {(["points", "rank"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                setHover(null);
              }}
              disabled={v === "rank" && rankSeries.length === 0}
              className={`press px-3 py-1 text-[11px] font-bold capitalize transition-colors disabled:opacity-40 ${view === v ? "bg-ink text-white" : "bg-surface text-mute"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-display text-2xl leading-none text-ink">{view === "points" ? `${latest?.points ?? 0} pts` : bestRank != null ? `#${bestRank} best` : "—"}</span>
        <span className="text-[11px] text-faint">
          {view === "points" ? `peak ${peak.points} pts` : latest?.rank != null ? `now #${latest.rank}` : "position charts as the nightly ladder runs"}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${sportMeta(sport).name} ${view} history`}
      >
        <defs>
          <linearGradient id="rh-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF6A35" stopOpacity="0.30" />
            <stop offset="1" stopColor="#FF6A35" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {geom?.ticks.map((tk) => {
          const y = view === "points" ? geom.yOf(tk) : geom.yOf(tk);
          return (
            <g key={tk}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--color-rule-soft)" strokeWidth="1" />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize="9.5" fill="var(--color-faint)" fontFamily="ui-monospace, monospace">
                {view === "rank" ? `#${tk}` : tk}
              </text>
            </g>
          );
        })}
        {geom?.xLabels.map((xl) => (
          <text key={xl.x} x={xl.x} y={H - 10} textAnchor="middle" fontSize="9.5" fill="var(--color-faint)" fontFamily="ui-monospace, monospace">
            {xl.label}
          </text>
        ))}

        {geom && view === "points" ? (
          <path d={`${smoothPath(geom.pts)} L ${geom.pts[geom.pts.length - 1].x} ${H - PAD.b} L ${geom.pts[0].x} ${H - PAD.b} Z`} fill="url(#rh-area)" />
        ) : null}
        {geom ? <path d={smoothPath(geom.pts)} fill="none" stroke={view === "points" ? "#E23E0D" : "#201B12"} strokeWidth="2.25" strokeLinecap="round" /> : null}

        {hoverPt && hoverRow ? (
          <g>
            <line x1={hoverPt.x} x2={hoverPt.x} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-rule-2)" strokeDasharray="3 3" />
            <circle cx={hoverPt.x} cy={hoverPt.y} r="4.5" fill="#FFFDF8" stroke="#E23E0D" strokeWidth="2.5" />
          </g>
        ) : null}
      </svg>

      {hoverRow ? (
        <p className="mt-1 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-mute">
          {new Date(weekMs(hoverRow.week)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} ·{" "}
          {view === "points" ? `${hoverRow.points} pts` : `#${hoverRow.rank}`}
        </p>
      ) : (
        <p className="mt-1 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-faint">Weekly since first result · hover to inspect</p>
      )}
    </div>
  );
}
