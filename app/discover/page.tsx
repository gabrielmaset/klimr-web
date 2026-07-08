import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Radar, Sparkle, ArrowRight, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { AdSlot } from "@/components/ads/ad-slot";
import { suggestedOpponents } from "@/lib/match-intel";

export const metadata: Metadata = { title: "Discover players" };

function scoreColor(s: number): { bg: string; fg: string } {
  if (s >= 70) return { bg: "var(--color-tint-success)", fg: "var(--color-success)" };
  if (s >= 45) return { bg: "var(--color-tint-warning)", fg: "var(--color-warning)" };
  return { bg: "var(--color-bg)", fg: "var(--color-mute)" };
}

/* A match-score gauge ring drawn around the player's avatar. */
function ScoredAvatar({ score, url, hue, name, size }: { score: number; url: string | null; hue: number; name: string; size: number }) {
  const stroke = Math.max(4, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(100, Math.max(0, score)) / 100);
  const col = scoreColor(score).fg;
  const inner = size - stroke * 2 - 5;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-rule)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <Avatar url={url} hue={hue} name={name} size={inner} />
      </div>
    </div>
  );
}

/* The compatibility breakdown — the page's tagline made literal. */
function FactorBars({ factors }: { factors: { location: number; skill: number; availability: number; style: number } }) {
  const rows: [string, number][] = [
    ["Area", factors.location],
    ["Skill", factors.skill],
    ["Timing", factors.availability],
    ["Style", factors.style],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2.5">
          <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-faint">{label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule">
            <span className="block h-full rounded-full transition-all" style={{ width: `${v}%`, background: scoreColor(v).fg }} />
          </span>
          <span className="w-6 shrink-0 text-right text-[10px] font-semibold tabular text-mute">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/discover");

  const [{ data: mySportsRows }, { data: profile }] = await Promise.all([
    supabase.from("player_sports").select("sport_key").eq("user_id", user.id),
    supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle(),
  ]);
  const mySports = [...new Set((mySportsRows ?? []).map((r) => r.sport_key))].filter((k) => SPORT_KEYS.includes(k));

  if (mySports.length === 0) {
    return (
      <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Match Intelligence</h1>
        <div className="mt-5 rounded-3xl border border-rule bg-surface shadow-e1 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint-brand text-brand-deep">
            <Radar size={22} />
          </span>
          <p className="mt-3 text-base font-bold text-ink">Add a sport to get matched</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-mute">Tell us what you play and the engine will rank opponents near your level and area.</p>
          <Link href="/onboarding" className="press mt-4 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep shadow-md shadow-brand/25">
            Set up your sports
          </Link>
        </div>
      </div>
    );
  }

  const selected = sport && mySports.includes(sport) ? sport : mySports.includes(profile?.primary_sport ?? "") ? (profile!.primary_sport as string) : mySports[0];
  const suggestions = await suggestedOpponents(supabase, user.id, selected, 12);
  const meta = sportMeta(selected);
  const top = suggestions[0] ?? null;
  const rest = suggestions.slice(1);
  const aurl = (path: string | null) => (path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null);

  // Open matches that still need players (any sport, soonest first).
  const { data: openMatches } = await supabase
    .from("matches")
    .select("id, sport_key, format, scheduled_at, total_slots, location_text, court_id, organizer_id")
    .eq("status", "open")
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(16);
  const openList = openMatches ?? [];
  type NeedRow = { id: string; sport_key: string; format: string; scheduled_at: string | null; total_slots: number; filled: number; org: string; place: string | null };
  let needPlayers: NeedRow[] = [];
  if (openList.length) {
    const ids = openList.map((m) => m.id);
    const orgIds = [...new Set(openList.map((m) => m.organizer_id))];
    const courtIds = [...new Set(openList.map((m) => m.court_id).filter(Boolean) as string[])];
    const [{ data: counts }, { data: orgs2 }, courtRes] = await Promise.all([
      supabase.from("match_participants").select("match_id, user_id").in("match_id", ids),
      supabase.from("profiles").select("id, display_name").in("id", orgIds),
      courtIds.length ? supabase.from("courts").select("id, name").in("id", courtIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const cMap = new Map<string, number>();
    const mine = new Set<string>();
    for (const c of counts ?? []) {
      cMap.set(c.match_id, (cMap.get(c.match_id) ?? 0) + 1);
      if (c.user_id === user.id) mine.add(c.match_id);
    }
    const oMap = new Map((orgs2 ?? []).map((o) => [o.id, o.display_name]));
    const courtMap = new Map(((courtRes.data as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c.name]));
    needPlayers = openList
      .filter((m) => (cMap.get(m.id) ?? 0) < m.total_slots && !mine.has(m.id))
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        sport_key: m.sport_key,
        format: m.format,
        scheduled_at: m.scheduled_at,
        total_slots: m.total_slots,
        filled: cMap.get(m.id) ?? 0,
        org: oMap.get(m.organizer_id) ?? "a player",
        place: (m.court_id ? courtMap.get(m.court_id) : null) ?? m.location_text ?? null,
      }));
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* Futuristic AI hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl px-6 py-7 sm:px-8 sm:py-9" style={{ background: "linear-gradient(135deg, #0b1020 0%, #171233 55%, #2a1530 100%)" }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 130% at 88% 8%, rgba(255,78,27,0.42), transparent 55%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.10]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
            <Sparkle size={12} className="text-brand" /> AI matchmaking
          </span>
          <h1 className="mt-3 font-display text-4xl leading-none text-white sm:text-5xl">Match Intelligence</h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/65">
            Your best {meta.name.toLowerCase()} opponents, scored on four signals — <span className="text-white/85">area, skill, timing, and play style</span>.
          </p>

          {mySports.length > 1 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {mySports.map((k) => {
                const m = sportMeta(k);
                const on = k === selected;
                return (
                  <Link
                    key={k}
                    href={`/discover?sport=${k}`}
                    className="press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{ borderColor: on ? "transparent" : "rgba(255,255,255,0.2)", background: on ? "var(--color-brand)" : "rgba(255,255,255,0.08)", color: on ? "#fff" : "rgba(255,255,255,0.78)" }}
                  >
                    {m.emoji} {m.name}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint-brand text-brand-deep">
            <Radar size={22} />
          </span>
          <p className="mt-3 text-base font-bold text-ink">No {meta.name.toLowerCase()} matches yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-mute">As more players join your area, the engine will surface your best opponents here.</p>
        </div>
      ) : (
        <>
          {/* Top match spotlight */}
          {top ? (
            <div className="mb-4 overflow-hidden rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
              <span className="kicker text-brand-deep">★ Top match</span>
              <div className="mt-3 grid gap-5 lg:grid-cols-[1.05fr_1fr] lg:items-center">
                <Link href={`/profile/${top.userId}`} className="flex items-center gap-4">
                  <ScoredAvatar score={top.score} url={aurl(top.avatarPath)} hue={top.avatarHue} name={top.displayName} size={88} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-lg font-bold text-ink">{top.displayName}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular" style={{ background: scoreColor(top.score).bg, color: scoreColor(top.score).fg }}>
                        {top.score}% match
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-mute">
                      {[top.neighborhood, top.city].filter(Boolean).join(", ") || "—"}
                      {top.skillLevel ? ` · ${top.skillLevel}` : ""}
                    </p>
                    {top.reasons.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {top.reasons.slice(0, 3).map((r) => (
                          <span key={r} className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
                <div className="rounded-2xl bg-bg/60 p-4 lg:border-l lg:border-rule lg:bg-transparent lg:p-0 lg:pl-6">
                  <p className="kicker mb-2.5 text-faint">Compatibility breakdown</p>
                  <FactorBars factors={top.factors} />
                  <Link href={`/profile/${top.userId}`} className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand/25 transition-colors hover:bg-brand-deep">
                    View profile <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {/* Ranked grid */}
          {rest.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rest.map((s) => {
                const sc = scoreColor(s.score);
                return (
                  <Link key={s.userId} href={`/profile/${s.userId}`} className="lift block rounded-3xl border border-rule bg-surface shadow-e1 p-4">
                    <div className="flex items-center gap-3.5">
                      <ScoredAvatar score={s.score} url={aurl(s.avatarPath)} hue={s.avatarHue} name={s.displayName} size={58} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{s.displayName}</p>
                        <p className="truncate text-xs text-mute">
                          {[s.neighborhood, s.city].filter(Boolean).join(", ") || "—"}
                          {s.skillLevel ? ` · ${s.skillLevel}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular" style={{ background: sc.bg, color: sc.fg }}>
                        {s.score}%
                      </span>
                    </div>
                    <div className="mt-3.5 border-t border-rule pt-3">
                      <FactorBars factors={s.factors} />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      {/* Open matches you can jump into */}
      {needPlayers.length > 0 ? (
        <section className="mt-9">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="kicker flex items-center gap-1.5 text-brand-deep">
              <Zap size={13} /> Open matches · {needPlayers.length} need a player
            </h2>
            <Link href="/play" className="press text-xs font-semibold text-brand-deep hover:underline">
              See all →
            </Link>
          </div>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {needPlayers.map((m) => {
              const m2 = sportMeta(m.sport_key);
              const left = m.total_slots - m.filled;
              const d = m.scheduled_at ? new Date(m.scheduled_at) : null;
              return (
                <Link key={m.id} href={`/play/${m.id}`} className="lift w-64 shrink-0 snap-start rounded-2xl border border-rule bg-surface shadow-e1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xl" aria-hidden>
                      {m2.emoji}
                    </span>
                    <span className="kicker rounded-full bg-tint-brand px-2 py-1 text-[9px] text-brand-deep">
                      {left} spot{left === 1 ? "" : "s"} open
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-ink">
                    {m2.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
                  </h3>
                  <p className="mt-1 text-xs text-mute">{d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Open · anytime"}</p>
                  {m.place ? <p className="mt-0.5 truncate text-xs text-faint">{m.place}</p> : null}
                  <p className="mt-2 border-t border-rule pt-2 text-xs text-faint">
                    by {m.org} · {m.filled}/{m.total_slots} in
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <AdSlot className="mt-7" label="Local sponsor" />

      <p className="mt-6 text-xs leading-relaxed text-faint">Scores use your profile, ranking, and availability. Sharpen your matches by keeping your area and play times current on your account.</p>
    </div>
  );
}
