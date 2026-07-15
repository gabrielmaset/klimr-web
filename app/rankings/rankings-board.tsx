"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Zap, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, StatusPill } from "@/components/page-header";

/* The four sports. Keys match the DB; the emoji is presentation-only. */
const SPORTS = [
  { key: "tennis", name: "Tennis", emoji: "🎾" },
  { key: "pickleball", name: "Pickleball", emoji: "🏓" },
  { key: "padel", name: "Padel", emoji: "🟡" },
  { key: "racquetball", name: "Racquetball", emoji: "🟦" },
] as const;

type ScopeKey = "zip" | "city" | "state" | "national" | "world";

function agoShort(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
  if (days === 0) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}


export type ProfileLite = {
  name: string;
  hue: number;
  zip: string | null;
  city: string | null;
  state: string | null;
  country: string;
};

type RankedRow = {
  user_id: string;
  display_name: string;
  avatar_hue: number;
  verification_status: string;
  points: number;
  skill_rating: number | null;
  matches_played: number;
  wins: number;
  rank: number;
  last_result_at: string | null;
};

/* Medal ring colors: gold / silver / bronze for ranks 1 / 2 / 3. */
const MEDAL = ["#e8b007", "#9aa0aa", "#c07d3e"];

const COUNTRY: Record<string, string> = { US: "United States" };
const CARD =
  "rounded-[18px] border border-rule bg-surface shadow-e1 p-5";

const mod = (n: number, m: number) => ((n % m) + m) % m;
const initials = (name: string) =>
  name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const compact = (n: number) =>
  n >= 1e6
    ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M"
    : n >= 1e3
      ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K"
      : String(n);

function bandLabel(pct: number, rank: number) {
  if (rank === 1 || pct <= 0.04) return "Summit";
  if (pct <= 0.12) return "Contender";
  if (pct <= 0.35) return "Ascending";
  return "Base camp";
}

/* ---------- avatar disc (hue gradient + initials) ---------- */
function Disc({ row, you, size = 36 }: { row: RankedRow; you: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(145deg, hsl(${row.avatar_hue},70%,52%), hsl(${mod(row.avatar_hue + 24, 360)},66%,42%))`,
        boxShadow: you ? "0 0 0 2px #fff, 0 0 0 3.5px var(--color-brand)" : "none",
      }}
    >
      {initials(row.display_name)}
    </span>
  );
}

/* ---------- podium: the Klimr mark itself — one ascending staircase with the
   three winners seated on its three steps. The champion (rank 1, top-right)
   wears a gold crown; each avatar carries a gold/silver/bronze rank pill, and
   names + points sit on the step face just below. Geometry is the exact mark
   path in its native 512 space; avatars straddle each landing. */
const KLIMR_STAIR =
  "M 64,438 L 64,382 A 22 22 0 0 1 86,360 L 182,360 A 10 10 0 0 0 192,350 L 192,282 A 22 22 0 0 1 214,260 L 310,260 A 10 10 0 0 0 320,250 L 320,182 A 22 22 0 0 1 342,160 L 426,160 A 22 22 0 0 1 448,182 L 448,438 A 22 22 0 0 1 426,460 L 86,460 A 22 22 0 0 1 64,438 Z";

function Podium({ top3, place, userId }: { top3: RankedRow[]; place: string; userId: string }) {
  const AR = 30; // avatar radius (equal across steps)
  // Each landing of the mark, paired with a winner. rank 1 = highest, right.
  const seats = [
    { row: top3[0], rank: 1, cx: 384, top: 160, x0: 342, x1: 426 },
    { row: top3[1], rank: 2, cx: 262, top: 260, x0: 214, x1: 310 },
    { row: top3[2], rank: 3, cx: 134, top: 360, x0: 86, x1: 182 },
  ];

  return (
    <div className={CARD}>
      <div className="kicker mb-2 text-faint">The summit · {place}</div>
      <div className="mx-auto w-full max-w-[360px] lg:max-w-[420px]">
        <svg
          viewBox="40 92 432 400"
          className="block h-auto w-full"
          role="img"
          aria-label={`Top three at ${place}: 1 ${top3[0].display_name}, 2 ${top3[1].display_name}, 3 ${top3[2].display_name}`}
        >
          <defs>
            <linearGradient id="stepDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#262630" />
              <stop offset="1" stopColor="#111116" />
            </linearGradient>
            {seats.map((s) => (
              <linearGradient key={`pav${s.rank}`} id={`pav${s.rank}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={`hsl(${s.row.avatar_hue},72%,55%)`} />
                <stop offset="1" stopColor={`hsl(${mod(s.row.avatar_hue + 26, 360)},66%,44%)`} />
              </linearGradient>
            ))}
            <radialGradient id="summitHalo" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ff7a4d" stopOpacity="0.34" />
              <stop offset="1" stopColor="#ff7a4d" stopOpacity="0" />
            </radialGradient>
            <filter id="podShadow" x="-30%" y="-20%" width="160%" height="150%">
              <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#0a0a0b" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* grounding shadow */}
          <ellipse cx="256" cy="470" rx="200" ry="13" fill="#0a0a0b" opacity="0.06" />
          {/* a soft, contained glow behind the champion — warmth, not a floating blob */}
          <circle cx="384" cy="158" r="60" fill="url(#summitHalo)" />

          {/* the Klimr staircase mark */}
          <path d={KLIMR_STAIR} fill="url(#stepDark)" filter="url(#podShadow)" />

          {/* a medal hairline along each landing edge — gold / silver / bronze */}
          {seats.map((s) => (
            <line key={`e${s.rank}`} x1={s.x0 + 14} y1={s.top + 1.5} x2={s.x1 - 14} y2={s.top + 1.5} stroke={MEDAL[s.rank - 1]} strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
          ))}

          {/* name + points on each step face */}
          {seats.map((s) => {
            const you = s.row.user_id === userId;
            return (
              <g key={`l${s.rank}`}>
                <text x={s.cx} y={s.top + AR + 22} textAnchor="middle" style={{ fontFamily: '"DM Sans Variable", sans-serif', fontWeight: 700, fontSize: 16, fill: you ? "#ff7a4d" : "#ffffff" }}>
                  {you ? "You" : firstName(s.row.display_name)}
                </text>
                <text x={s.cx} y={s.top + AR + 41} textAnchor="middle" style={{ fontFamily: '"JetBrains Mono Variable", monospace', fontSize: 12, fill: "rgba(255,255,255,.66)" }}>
                  {compact(s.row.points)} pts
                </text>
              </g>
            );
          })}

          {/* avatars straddling each landing top */}
          {seats.map((s) => {
            const you = s.row.user_id === userId;
            return (
              <g key={`a${s.rank}`}>
                <circle cx={s.cx} cy={s.top} r={AR} fill={`url(#pav${s.rank})`} stroke={you ? "#ff4e1b" : MEDAL[s.rank - 1]} strokeWidth={s.rank === 1 ? 4 : 3} />
                <text x={s.cx} y={s.top + 1} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: '"DM Sans Variable", sans-serif', fontWeight: 700, fontSize: AR * 0.8, fill: "#fff" }}>
                  {initials(s.row.display_name)}
                </text>
              </g>
            );
          })}

          {/* rank pills (1 / 2 / 3) on each avatar's lower edge */}
          {seats.map((s) => (
            <g key={`b${s.rank}`}>
              <circle cx={s.cx + 20} cy={s.top + 20} r={11} fill={MEDAL[s.rank - 1]} stroke="#ffffff" strokeWidth="2" />
              <text x={s.cx + 20} y={s.top + 20.5} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: '"DM Sans Variable", sans-serif', fontWeight: 800, fontSize: 12, fill: s.rank === 1 ? "#3a2a00" : "#ffffff" }}>
                {s.rank}
              </text>
            </g>
          ))}

          {/* a gold crown marks the champion — the summit, made tasteful */}
          <g>
            <path d="M366,132 L366,113 L375,121 L384,103 L393,121 L402,113 L402,132 Z" fill={MEDAL[0]} stroke="#a8780a" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="366" cy="113" r="1.7" fill="#fff" opacity="0.9" />
            <circle cx="384" cy="103" r="2" fill="#fff" opacity="0.95" />
            <circle cx="402" cy="113" r="1.7" fill="#fff" opacity="0.9" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ---------- a compact leaders card for when fewer than three are ranked ---------- */
function Leaders({ rows, place, userId }: { rows: RankedRow[]; place: string; userId: string }) {
  return (
    <div className={CARD}>
      <div className="kicker mb-4 text-faint">The summit · {place}</div>
      <div className="space-y-2">
        {rows.map((r) => {
          const you = r.user_id === userId;
          return (
            <Link
              key={r.user_id}
              href={`/profile/${r.user_id}`}
              className="lift flex items-center gap-3 rounded-xl border px-3 py-3"
              style={{ background: you ? "var(--color-tint-brand)" : "var(--color-bg)", borderColor: you ? "var(--color-brand)" : "var(--color-rule)" }}
            >
              <span className="font-mono text-sm font-bold tabular" style={{ color: you ? "var(--color-brand)" : "var(--color-faint)" }}>#{r.rank}</span>
              <Disc row={r} you={you} />
              <span className="flex-1 truncate font-bold text-ink">{you ? "You" : r.display_name}</span>
              <span className="font-mono text-sm text-mute">{fmt(r.points)} pts</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-mute">
        The summit of {place} is barely contested. Climb in — three players light up the podium.
      </p>
    </div>
  );
}

/* ============================================================ */
export function RankingsBoard({
  userId,
  profile,
  initialSportKey,
}: {
  userId: string;
  profile: ProfileLite;
  initialSportKey: string;
}) {
  const supabase = useMemo(() => createClient(), []);

  const scopes = useMemo(
    () =>
      [
        { key: "zip", label: "ZIP", place: profile.zip ?? "Set ZIP", region: profile.zip },
        { key: "city", label: "City", place: profile.city ?? "—", region: profile.city },
        { key: "state", label: "State", place: profile.state ?? "—", region: profile.state },
        { key: "national", label: "National", place: COUNTRY[profile.country] ?? profile.country, region: profile.country },
        { key: "world", label: "World", place: "Earth", region: null },
      ] as { key: ScopeKey; label: string; place: string; region: string | null }[],
    [profile],
  );

  const [sportIdx, setSportIdx] = useState(() => {
    const i = SPORTS.findIndex((s) => s.key === initialSportKey);
    return i >= 0 ? i : 0;
  });
  const [scopeIdx, setScopeIdx] = useState(0);
  const [cache, setCache] = useState<Record<string, RankedRow[]>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const sport = SPORTS[sportIdx];
  const scope = scopes[scopeIdx];

  // Fetch all five scopes for the active sport (so scope-switching is instant and
  // the rail can show real field counts). Pre-launch volumes are tiny; at scale a
  // focused server-side RPC would replace this fan-out.
  useEffect(() => {
    let active = true;
    const sportKey = sport.key;
    Promise.all(
      scopes.map(async (sc) => {
        const k = `${sportKey}:${sc.key}`;
        if (sc.key !== "world" && !sc.region) return [k, [] as RankedRow[]] as const;
        const { data } = await supabase.rpc("ranked_players", {
          p_sport: sportKey,
          p_scope: sc.key,
          p_region: sc.region,
        });
        return [k, ((data as RankedRow[] | null) ?? [])] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setCache((prev) => {
        const next = { ...prev };
        for (const [k, v] of entries) next[k] = v;
        return next;
      });
      setLoadedKey(sportKey);
    });
    return () => {
      active = false;
    };
  }, [sport.key, scopes, supabase]);

  const ready = loadedKey === sport.key;
  const key = `${sport.key}:${scope.key}`;
  const rows = cache[key] ?? [];
  const field = rows.length;
  const meIdx = rows.findIndex((r) => r.user_id === userId);
  const me = meIdx >= 0 ? rows[meIdx] : null;
  const top3 = rows.slice(0, 3);
  const windowRows = me ? rows.slice(Math.max(0, meIdx - 2), Math.min(rows.length, meIdx + 3)) : [];
  const above = me && meIdx > 0 ? rows[meIdx - 1] : null;
  const pct = me ? me.rank / field : 0;
  const markerTop = Math.min(94, Math.max(8, pct * 100));
  const pctLabel = me ? (me.rank === 1 ? "Summit" : `top ${Math.max(1, Math.round(pct * 100))}%`) : "—";
  const countReady = (k: ScopeKey) => cache[`${sport.key}:${k}`] !== undefined;
  const countFor = (k: ScopeKey) => cache[`${sport.key}:${k}`]?.length ?? 0;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* header — Daylight §2.3 */}
      <PageHeader
        kicker="Compete — Rankings"
        title="The Mountain"
        sub="Every match you log moves you up the slope — from your ZIP to the planet."
        pill={me ? <StatusPill dot="flame">{`YOU · #${fmt(me.rank)} · ${bandLabel(pct, me.rank).toUpperCase()}`}</StatusPill> : undefined}
      />

      {/* sport tabs + live cue */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SPORTS.map((s, i) => {
            const on = i === sportIdx;
            return (
              <button
                key={s.key}
                onClick={() => setSportIdx(i)}
                aria-pressed={on}
                className="press flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  borderColor: on ? "transparent" : "var(--color-rule-2)",
                  background: on ? "linear-gradient(140deg, #FF6A35, #E23E0D)" : "var(--color-surface)",
                  color: on ? "#fff" : "var(--color-mute)",
                  boxShadow: on ? "var(--shadow-flame)" : "none",
                }}
              >
                <span aria-hidden>{s.emoji}</span>
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* THE MOUNTAIN — §3.2.2 (scope nodes over the ridge) */}
      <div className="relative mt-6 h-[320px] overflow-hidden rounded-[22px]" style={{ border: "1px solid #E3E5D8", background: "linear-gradient(180deg,#E9F2FA 0%,#F6F4EA 62%,#F3EFE2 100%)" }}>
        <svg viewBox="0 0 1000 320" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id="mtn-sun" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(920 70) scale(100)">
              <stop stopColor="#E8A50C" stopOpacity=".35" /><stop offset="1" stopColor="#E8A50C" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="mtn-far" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#D9E4D0" /><stop offset="1" stopColor="#CFDCC4" /></linearGradient>
            <linearGradient id="mtn-near" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#C3D3B5" /><stop offset="1" stopColor="#B4C7A4" /></linearGradient>
          </defs>
          <circle cx="920" cy="70" r="100" fill="url(#mtn-sun)" />
          <path d="M0,252 L140,196 L280,228 L450,158 L590,196 L740,124 L880,170 L1000,92 L1000,320 L0,320 Z" fill="url(#mtn-far)" />
          <path d="M0,282 L170,230 L340,258 L520,186 L690,224 L870,146 L1000,180 L1000,320 L0,320 Z" fill="url(#mtn-near)" />
          <path d="M60,272 L200,238 L300,256 L430,196 L560,222 L700,150 L810,176 L928,78" fill="none" stroke="rgba(32,27,18,.38)" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
          <path d="M921,78 L921,54 L940,60 L921,66" fill="var(--color-flame-deep)" />
        </svg>
        <div className="absolute left-5 top-4">
          <p className={`font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-[9px]`} style={{ color: "var(--color-ink-4)" }}>The ascent</p>
          <p className="mt-0.5 font-display text-[21px] font-bold leading-none tracking-[-0.015em] text-ink">{scope.place}</p>
          <p className="mt-1 font-mono text-[10px] font-semibold" style={{ color: "var(--color-ink-4)" }}>{countReady(scope.key) ? `${compact(countFor(scope.key))} climbers` : "…"}</p>
        </div>
        {me ? (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.14em]" style={{ background: "var(--color-tint-brand)", borderColor: "var(--color-tint-brand-bd)", color: "var(--color-flame-text)" }}>
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
            You · #{fmt(me.rank)} · {bandLabel(pct, me.rank)}
          </span>
        ) : null}
        {scopes.map((s, i) => {
          const on = i === scopeIdx;
          const pos = [{x:"7%",top:258},{x:"29%",top:214},{x:"51%",top:168},{x:"73%",top:120},{x:"92%",top:76}][i];
          return (
            <button
              key={s.key}
              onClick={() => setScopeIdx(i)}
              aria-pressed={on}
              aria-label={`${s.label} — ${s.place}`}
              className="absolute -translate-x-1/2 text-center"
              style={{ left: pos.x, top: pos.top - 16 }}
            >
              <span
                className={`mx-auto grid h-[33px] w-[33px] place-items-center rounded-full font-mono text-[12px] font-bold transition-transform ${on ? "text-white" : "text-ink"} hover:scale-[1.12]`}
                style={on
                  ? { background: "linear-gradient(140deg, #FF6A35, #E23E0D)", animation: "nodePulse 2.4s ease-in-out infinite" }
                  : { background: "#fff", border: "1px solid #D9CFBB", boxShadow: "0 2px 8px -4px rgba(90,68,35,.35)" }}
              >
                {i + 1}
              </span>
              <span className={`font-mono text-[9.5px] font-bold uppercase tracking-[.18em] mt-1.5 block text-[8.5px] ${on ? "text-flame-text" : ""}`} style={on ? undefined : { color: "var(--color-ink-4)" }}>{s.label}</span>
              <span className="block max-w-[110px] truncate text-[12.5px] font-bold leading-tight text-ink max-sm:hidden">{s.place}</span>
              <span className="block font-mono text-[10px]" style={{ color: "var(--color-ink-4)" }}>{countReady(s.key) ? compact(countFor(s.key)) : "·"}</span>
            </button>
          );
        })}
      </div>

      {/* body */}
      {!ready ? (
        <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-7">
          <div className={`${CARD} h-[460px] animate-pulse`} />
          <div className="grid content-start gap-5">
            <div className={`${CARD} h-[200px] animate-pulse`} />
            <div className={`${CARD} h-[240px] animate-pulse`} />
          </div>
        </div>
      ) : field === 0 ? (
        <div className={`${CARD} mt-7 text-center`}>
          <div className="mx-auto max-w-md py-8">
            <div className="text-3xl" aria-hidden>{sport.emoji}</div>
            <h2 className="mt-3 font-display text-2xl text-ink">No {sport.name.toLowerCase()} players in {scope.place} yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              {scope.key !== "world" && !scope.region
                ? "Add your home ZIP in your account to see your local board."
                : `Be the first to put ${scope.place} on the ${sport.name.toLowerCase()} map. Rankings fill in as players log results in the Klimr app.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-7">
          {field >= 3 ? (
            <Podium top3={top3} place={scope.place} userId={userId} />
          ) : (
            <Leaders rows={rows} place={scope.place} userId={userId} />
          )}

          <div className="grid content-start gap-5">
            {me ? (
              <>
                {/* your standing */}
                <div className={CARD}>
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint">Your standing · {scope.place}</div>
                  <div className="mt-3 flex gap-5">
                    {/* position spine */}
                    <div className="relative h-[156px] w-7 shrink-0">
                      <div className="absolute left-1/2 h-full w-2 -translate-x-1/2 rounded-full" style={{ background: "linear-gradient(to top, #ececef 0%, #d63a0f 74%, #ff4e1b 92%, #ffb547 100%)" }} />
                      <Crown size={14} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 text-pop" />
                      <div className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2" style={{ background: "#d4d4d8" }} />
                      <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all" style={{ top: `${markerTop}%` }}>
                        <span className="relative grid place-items-center">
                          <span className="live-dot absolute h-4 w-4 rounded-full" style={{ background: `hsl(${profile.hue},80%,60%)` }} />
                          <span className="relative h-3 w-3 rounded-full" style={{ background: `hsl(${profile.hue},85%,58%)`, boxShadow: "0 0 0 2px #fff" }} />
                        </span>
                      </div>
                      <span className="absolute left-7 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold" style={{ top: `${markerTop}%`, color: `hsl(${profile.hue},70%,42%)` }}>you</span>
                    </div>

                    {/* numbers */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-end gap-2">
                        <span className="font-display font-bold leading-none tracking-[-0.02em] text-ink" style={{ fontSize: "clamp(3rem, 8vw, 84px)" }}><span className="text-brand" style={{ fontSize: "0.55em" }}>#</span>{fmt(me.rank)}</span>
                        <span className="pb-2 font-mono text-sm text-mute">of {fmt(field)}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Tile label="Percentile" value={pctLabel} />
                        <Tile label="Ahead of" value={fmt(field - me.rank)} mono />
                        <Tile label="Points" value={fmt(me.points)} mono color="#0a0a0b" />
                        <Tile label="Altitude" value={bandLabel(pct, me.rank)} color="var(--color-sun-text)" pop />
                      </div>
                    </div>
                  </div>
                </div>

                {/* contention */}
                <div className={CARD}>
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint">Contention · who&rsquo;s near you</div>
                  <div className="mt-4 space-y-2">
                    {windowRows.map((r) => {
                      const you = r.user_id === userId;
                      return (
                        <Link
                          key={r.user_id}
                          href={`/profile/${r.user_id}`}
                          className="lift flex items-center gap-3 rounded-xl border px-3 py-2.5"
                          style={{ background: you ? "var(--color-tint-brand)" : "#FDFBF7", borderColor: you ? "#FFC9AA" : "var(--color-rule-soft)" }}
                        >
                          <span className="shrink-0 pr-1 font-mono text-[12px] font-bold tabular" style={{ color: you ? "var(--color-flame-text)" : "var(--color-faint)" }}>#{fmt(r.rank)}</span>
                          <Disc row={r} you={you} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-bold text-ink">{you ? "You" : r.display_name}</span>
                              {r.verification_status === "verified" ? <BadgeCheck size={13} className="shrink-0 text-brand" aria-label="Verified" /> : null}
                              {r.last_result_at ? (
                                <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-faint">{agoShort(r.last_result_at)}</span>
                              ) : null}
                            </div>
                            <div className="font-mono text-[11px] text-faint">{fmt(r.points)} pts</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl px-3.5 py-3" style={{ background: "var(--color-tint-warning)", border: "1px solid var(--color-tint-sun-bd)" }}>
                    <Zap size={15} className="shrink-0" style={{ color: "var(--color-sun-text)" }} />
                    <span className="text-[13px] text-ink">
                      {above ? (
                        <>
                          <b className="font-mono">{above.points - me.points} pts</b> to catch <b>{firstName(above.display_name)}</b> at #{fmt(above.rank)} — your next rung.
                        </>
                      ) : (
                        <>You hold the summit of {scope.place}. Defend it.</>
                      )}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className={CARD}>
                <div className="font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint">Your standing · {scope.place}</div>
                <h2 className="mt-3 font-display text-2xl text-ink">You&rsquo;re not on this board yet</h2>
                <p className="mt-2 text-sm leading-relaxed text-mute">
                  You don&rsquo;t have a {sport.name.toLowerCase()} ranking in {scope.place} yet. Rankings build as you log results — match scoring happens in the Klimr app.
                </p>
              </div>
            )}
            <div className={CARD}>
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint">How points work</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
                Ranked wins earn points for the sport you played, and every board — ZIP to World — reads the same
                totals at a different zoom. Log results in the Klimr app; the mountain updates as matches are confirmed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* insight */}
      {ready && me ? (
        <p className="mt-6 text-center text-sm text-mute">
          You&rsquo;re <b className="text-ink">{pctLabel === "Summit" ? "at the summit" : pctLabel}</b> of {scope.place} at {sport.name.toLowerCase()}
          {above ? (
            <>
              {" "}— only <b className="text-ink">{above.points - me.points} points</b> from climbing a rung.
            </>
          ) : (
            <> — nobody above you.</>
          )}
        </p>
      ) : null}
    </div>
  );
}

function Tile({ label, value, mono, color, pop }: { label: string; value: string; mono?: boolean; color?: string; pop?: boolean }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--color-bg)", border: `1px solid ${pop ? "var(--color-tint-sun-bd)" : "#EFE9DC"}` }}>
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-[8px] text-faint">{label}</div>
      <div className={`mt-0.5 text-[14px] font-bold ${mono ? "font-mono" : ""}`} style={{ color: color ?? "var(--color-ink)" }}>
        {value}
      </div>
    </div>
  );
}
