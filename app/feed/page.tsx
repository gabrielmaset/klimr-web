import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, MessageSquare, TrendingUp, Newspaper, Trophy, Sparkles, ArrowUpRight, Swords, Users, CalendarDays, MapPin, Clock, Lock, ChevronRight, UserPlus, Medal, ShoppingBag, HeartPulse, Flag } from "lucide-react";
import { lookupZip } from "@/lib/us-places";
import { FeedLivePill } from "@/components/feed-live-pill";
import { FeedComposer } from "@/components/feed-composer";
import { FeedPostActions } from "@/components/feed-post-actions";
import { createClient } from "@/lib/supabase/server";
import { AdSlot } from "@/components/ads/ad-slot";
import { sportMeta } from "@/lib/sports";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Countdown } from "@/components/countdown";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

type FeedRow = {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  sport_key: string | null;
  link_url: string | null;
  link_label: string | null;
  published_at: string;
  actor_id: string | null;
  zip: string | null;
  meta: Record<string, unknown> | null;
  audience: string;
  object_id: string | null;
};

const TZ = "America/Los_Angeles";

function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
}
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: TZ });
function nowIso() {
  return new Date().toISOString();
}
const nowMs = () => Date.now();

// Wire kind identity — Daylight §3.1.5 kicker colors.
const KIND_STYLE: Record<string, { label: string; Icon: typeof Megaphone; accent: string }> = {
  announcement: { label: "Announcement", Icon: Megaphone, accent: "var(--color-brand-deep)" },
  update: { label: "Product update", Icon: Sparkles, accent: "#4F46E5" },
  news: { label: "News", Icon: Newspaper, accent: "#64748B" },
  result: { label: "Match result", Icon: Trophy, accent: "var(--color-success)" },
  player_joined: { label: "New player", Icon: UserPlus, accent: "#1D4ED8" },
  match_result: { label: "Match result", Icon: Trophy, accent: "var(--color-success)" },
  event_published: { label: "New event", Icon: CalendarDays, accent: "var(--color-brand-deep)" },
  tournament_published: { label: "Tournament", Icon: Medal, accent: "#B45309" },
  gear_listed: { label: "Second Serve", Icon: ShoppingBag, accent: "#0E7490" },
  pro_verified: { label: "Training Room", Icon: HeartPulse, accent: "#BE185D" },
  team_formed: { label: "New team", Icon: Flag, accent: "#6D28D9" },
  member_post: { label: "Community", Icon: MessageSquare, accent: "var(--color-brand-deep)" },
  ranking_move: { label: "Rankings", Icon: TrendingUp, accent: "#E8A50C" },
};

/* ── ranked regional stream (FEED-ARCHITECTURE.md §2/§4) ─────────────── */
const RADIUS_MI = 25;
const HALF_LIFE_H = 48;
const KIND_WEIGHT: Record<string, number> = {
  match_result: 1.25, event_published: 1.15, tournament_published: 1.2,
  player_joined: 0.85, gear_listed: 0.75, pro_verified: 1.0, team_formed: 0.95,
  member_post: 1.15,
  ranking_move: 1.3,
};
function haversineMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const EVENT_KIND_LABEL: Record<string, string> = { open_play: "Open play", ladder: "Ladder night", clinic: "Clinic", tournament: "Tournament", social: "Social" };

const QUICK = [
  { href: "/play/new", Icon: Swords, label: "Log a match" },
  { href: "/discover", Icon: Users, label: "Find players" },
  { href: "/events", Icon: CalendarDays, label: "Browse events" },
  { href: "/courts", Icon: MapPin, label: "Find a court" },
];

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";

export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");
  const spRaw = await searchParams;
  const laneRaw = Array.isArray(spRaw.lane) ? spRaw.lane[0] : spRaw.lane;
  const lane: "nearby" | "circle" = laneRaw === "circle" ? "circle" : "nearby";

  const [{ data: profile }, { data: items }, { data: upNextEvents }, { data: myPart }, { data: upcomingMatches }, { data: teamFinals }] = await Promise.all([
    supabase.from("profiles").select("display_name, home_zip, primary_sport").eq("id", user.id).maybeSingle(),
    supabase.from("feed_items").select("id, kind, title, body, sport_key, link_url, link_label, published_at, actor_id, zip, meta, audience, object_id").order("published_at", { ascending: false }).limit(120),
    supabase.from("events").select("id, title, sport_key, kind, court_id, location_text, starts_at").eq("status", "active").gte("starts_at", nowIso()).order("starts_at").limit(3),
    supabase.from("match_participants").select("match_id").eq("user_id", user.id),
    supabase.from("matches").select("id, sport_key, format, scheduled_at, status, court_id").in("status", ["open", "scheduled"]).gte("scheduled_at", nowIso()).order("scheduled_at").limit(10),
    supabase
      .from("team_matches")
      .select("id, sport_key, scheduled_at, location_text, home_score, away_score, home_team_id, away_team_id")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .order("decided_at", { ascending: false })
      .limit(6),
  ]);

  const firstName = (profile?.display_name ?? "player").split(/\s+/)[0];
  const hourLA = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: TZ }));
  const daypart = hourLA < 12 ? "Morning" : hourLA < 18 ? "Afternoon" : "Evening";
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ }).toUpperCase();

  // ── My next match (hero) — the soonest upcoming match I'm in ──────────
  const myIds = new Set((myPart ?? []).map((p) => p.match_id));
  const myNext = (upcomingMatches ?? []).find((m) => myIds.has(m.id)) ?? null;
  let heroCourt: string | null = null;
  let heroOpponent: string | null = null;
  if (myNext) {
    if (myNext.court_id) {
      const { data: c } = await supabase.from("courts").select("name").eq("id", myNext.court_id).maybeSingle();
      heroCourt = c?.name ?? null;
    }
    const { data: others } = await supabase.from("match_participants").select("user_id").eq("match_id", myNext.id).neq("user_id", user.id).limit(1);
    if (others?.[0]) {
      const { data: op } = await supabase.from("profiles").select("display_name").eq("id", others[0].user_id).maybeSingle();
      heroOpponent = op?.display_name ?? null;
    }
  }

  // ── Ticker: real upcoming public matches + decided team finals ────────
  const courtIds = Array.from(new Set([...(upcomingMatches ?? []).map((m) => m.court_id), ...(upNextEvents ?? []).map((e) => e.court_id)].filter(Boolean))) as string[];
  const courtName = new Map<string, string>();
  if (courtIds.length) {
    const { data: courts } = await supabase.from("courts").select("id, name").in("id", courtIds);
    for (const c of courts ?? []) courtName.set(c.id, c.name);
  }
  const teamIds = Array.from(new Set((teamFinals ?? []).flatMap((t) => [t.home_team_id, t.away_team_id])));
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    const { data: ts } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const t of ts ?? []) teamName.set(t.id, t.name);
  }
  type Tick = { key: string; state: "UP NEXT" | "FINAL"; sport: string; label: string; score?: string; venue?: string | null };
  const ticks: Tick[] = [
    ...(upcomingMatches ?? []).slice(0, 6).map((m): Tick => ({
      key: `u${m.id}`,
      state: "UP NEXT",
      sport: m.sport_key,
      label: `${sportMeta(m.sport_key).name} · ${m.format === "doubles" ? "Doubles" : "Singles"}`,
      venue: (m.court_id && courtName.get(m.court_id)) || null,
    })),
    ...(teamFinals ?? []).map((t): Tick => ({
      key: `f${t.id}`,
      state: "FINAL",
      sport: t.sport_key,
      label: `${teamName.get(t.home_team_id) ?? "Home"} vs ${teamName.get(t.away_team_id) ?? "Away"}`,
      score: `${t.home_score}–${t.away_score}`,
      venue: t.location_text,
    })),
  ];

  // ── Your altitude — real ZIP standing via ranked_players ──────────────
  let altitude: { rank: number; field: number; pts: number } | null = null;
  const zip = profile?.home_zip ?? null;
  const altSport = profile?.primary_sport ?? "tennis";
  if (zip) {
    const { data: board } = await supabase.rpc("ranked_players", { p_sport: altSport, p_scope: "zip", p_region: zip });
    const rows = (board as { user_id: string; rank: number; points: number }[] | null) ?? [];
    const me = rows.find((r) => r.user_id === user.id);
    if (me) altitude = { rank: me.rank, field: rows.length, pts: me.points };
  }

  const raw = (items ?? []) as FeedRow[];

  // Region point + social graph (affinity + blocks), read-time.
  const viewerPt = profile?.home_zip ? lookupZip(profile.home_zip) : null;
  const [{ data: fr }, { data: bl }] = await Promise.all([
    supabase.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
  ]);
  const circle = new Set<string>();
  for (const f of fr ?? []) circle.add(f.requester_id === user.id ? f.addressee_id : f.requester_id);
  const blocked = new Set<string>();
  for (const b of bl ?? []) blocked.add(b.blocker_id === user.id ? b.blocked_id : b.blocker_id);

  type Scored = FeedRow & { city: string | null; score: number; inCircle: boolean; actorName: string | null };
  const regional: Scored[] = [];
  for (const it of raw) {
    if (it.actor_id && blocked.has(it.actor_id)) continue;
    let city: string | null = null;
    if (lane === "circle") {
      // Your circle: connections' activity, any distance (fan-out-on-read over a small graph).
      if (!it.actor_id || !circle.has(it.actor_id)) continue;
      if (it.zip) city = lookupZip(it.zip)?.city ?? null;
    } else if (it.audience !== "global") {
      if (!it.zip) continue;
      const pt = lookupZip(it.zip);
      if (!pt) continue;
      city = pt.city ?? null;
      if (viewerPt && haversineMi(viewerPt, pt) > RADIUS_MI) continue;
      if (!viewerPt) continue; // zipless viewers see the global lane until they set a home ZIP
    }
    const ageH = Math.max(0, (nowMs() - new Date(it.published_at).getTime()) / 36e5);
    const decay = Math.exp((-Math.LN2 * ageH) / HALF_LIFE_H);
    const weight = it.audience === "global" ? 1.35 : KIND_WEIGHT[it.kind] ?? 1;
    const inCircle = !!it.actor_id && circle.has(it.actor_id);
    regional.push({ ...it, city, inCircle, actorName: null, score: weight * decay * (inCircle ? 2.2 : 1) });
  }
  regional.sort((a, b) => b.score - a.score);
  const stream = regional.slice(0, 40);

  // Hydrate actor names fresh (never stored — profiles stay the source of truth).
  const actorIds = [...new Set(stream.map((s) => s.actor_id).filter((x): x is string => !!x))];
  if (actorIds.length) {
    const { data: actors } = await supabase.from("profiles").select("id, display_name").in("id", actorIds);
    const nameOf = new Map((actors ?? []).map((a) => [a.id, a.display_name ?? "A Klimr member"]));
    for (const s of stream) if (s.actor_id) s.actorName = nameOf.get(s.actor_id) ?? "A Klimr member";
  }

  // Member posts: like counts + the viewer's hearts, one batch each.
  const postIds = [...new Set(stream.filter((s) => s.kind === "member_post" && s.object_id).map((s) => s.object_id as string))];
  const likeCount = new Map<string, number>();
  const myLiked = new Set<string>();
  if (postIds.length) {
    const { data: likes } = await supabase.from("post_likes").select("post_id, user_id").in("post_id", postIds);
    for (const l of likes ?? []) {
      likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
      if (l.user_id === user.id) myLiked.add(l.post_id);
    }
  }

  // Collapse: several new players in the same city within 24h become one card.
  type StreamEntry = { type: "item"; item: Scored } | { type: "player_group"; city: string; names: string[]; newest: string };
  const entries: StreamEntry[] = [];
  const grouped = new Set<string>();
  for (const s of stream) {
    if (s.kind === "player_joined" && s.city) {
      const key = `${s.city}`;
      if (grouped.has(key)) continue;
      const mates = stream.filter((x) => x.kind === "player_joined" && x.city === s.city && Math.abs(new Date(x.published_at).getTime() - new Date(s.published_at).getTime()) < 24 * 36e5);
      if (mates.length >= 2) {
        grouped.add(key);
        entries.push({ type: "player_group", city: s.city, names: mates.map((m) => m.actorName ?? "A member").slice(0, 4), newest: mates[0].published_at });
        continue;
      }
    }
    entries.push({ type: "item", item: s });
  }
  const feed = entries;
  const upcomingCount = (upcomingMatches ?? []).length;

  return (
    <div className="mx-auto max-w-page px-[30px] pb-16 pt-[22px]">
      <PageHeader
        kicker={`Home — ${todayLabel}`}
        title={`${daypart}, ${firstName}.`}
        sub="Your matches, your mountain, and the wire — all in one basecamp."
        pill={<StatusPill dot="grass">{upcomingCount} {upcomingCount === 1 ? "match" : "matches"} lined up near you</StatusPill>}
      />

      {/* ── Live ticker (§3.1.2) ─────────────────────────────────────── */}
      {ticks.length > 0 ? (
        <div className="mt-5 overflow-hidden border-y border-rule" aria-label="Around the courts">
          <div className="flex w-max animate-[tickerScroll_46s_linear_infinite] hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex" aria-hidden={copy === 1}>
                {ticks.map((t) => (
                  <div key={`${copy}${t.key}`} className="flex items-center gap-2.5 border-r border-rule-soft px-4 py-2.5">
                    <span className={`${monoKicker} flex items-center gap-1.5 ${t.state === "FINAL" ? "text-faint" : "text-sun-text"}`}>
                      {t.state === "UP NEXT" ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-sun" aria-hidden /> : null}
                      {t.state}
                    </span>
                    <span aria-hidden>{sportMeta(t.sport).emoji}</span>
                    <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">{t.label}</span>
                    {t.score ? <span className="font-mono text-xs font-bold" style={{ color: "#B45309" }}>{t.score}</span> : null}
                    {t.venue ? <span className="whitespace-nowrap text-[11.5px] text-faint">{t.venue}</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0">
          {/* ── Next-match hero (§3.1.4) — only when there is one ──────── */}
          {myNext ? (
            <div className="relative overflow-hidden rounded-[20px] border p-6" style={{ borderColor: "var(--color-tint-brand-bd2)", background: "linear-gradient(130deg, #FFF1E8, #FFFFFF 58%)" }}>
              <svg aria-hidden viewBox="0 0 600 200" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: 0.1 }}>
                <path d="M0,150 L120,100 L240,135 L380,70 L500,110 L600,55" fill="none" stroke="var(--color-brand)" strokeWidth="2" />
                <path d="M0,180 L140,130 L280,165 L430,100 L600,140" fill="none" stroke="var(--color-brand)" strokeWidth="2" />
              </svg>
              <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className={`${monoKicker} text-flame-text`}>Next match</p>
                  <h2 className="mt-1.5 font-display text-[27px] font-bold leading-none tracking-[-0.02em] text-ink">
                    {sportMeta(myNext.sport_key).name} · {myNext.format === "doubles" ? "Doubles" : "Singles"}
                  </h2>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-ink-soft">
                    {myNext.scheduled_at ? (
                      <span className="inline-flex items-center gap-1.5"><Clock size={14} className="text-brand-deep" />{fmt(myNext.scheduled_at, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
                    ) : null}
                    {heroCourt ? <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-brand-deep" />{heroCourt}</span> : null}
                  </p>
                  <p className="mt-4 flex items-center gap-2.5 text-sm font-semibold text-ink">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand bg-surface text-xs font-bold text-brand-deep" aria-hidden>
                      {(heroOpponent ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                    {heroOpponent ? <>vs {heroOpponent}</> : <span className="text-mute">Open spot — invite someone</span>}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link href={`/play/${myNext.id}`} className="press inline-flex h-[34px] items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                      Open match
                    </Link>
                    {heroCourt ? (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(heroCourt)}`} target="_blank" rel="noopener" className="press inline-flex h-[34px] items-center rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-soft hover:text-ink">
                        Directions
                      </a>
                    ) : null}
                  </div>
                </div>
                {myNext.scheduled_at ? <Countdown startsAt={myNext.scheduled_at} /> : null}
              </div>
            </div>
          ) : null}

          {/* ── The wire — live regional stream (FEED-ARCHITECTURE.md) ── */}
          <div className={`${myNext ? "mt-8" : ""} flex flex-wrap items-center justify-between gap-2`}>
            <p className={`${monoKicker} text-faint`}>The wire — {lane === "circle" ? "your circle" : viewerPt ? `${viewerPt.city ?? "your area"} + Klimr` : "Klimr"}</p>
            <div className="flex rounded-full border border-rule bg-surface p-0.5">
              <Link href="/feed" className={`press rounded-full px-3 py-1 text-xs font-bold ${lane === "nearby" ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}>Nearby</Link>
              <Link href="/feed?lane=circle" className={`press rounded-full px-3 py-1 text-xs font-bold ${lane === "circle" ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}>Your circle</Link>
            </div>
          </div>
          <FeedLivePill />
          <FeedComposer />
          <div className="mt-3 space-y-3.5">
            {feed.length === 0 ? (
              <div className="rounded-[18px] bg-bg px-5 py-8 text-center text-sm text-mute" style={{ border: "1px solid #EFE9DC" }}>
                {lane === "circle" ? "Your circle is quiet — connect with more players and their wins, posts, and events will land here." : viewerPt ? "Quiet around here so far — results, events, and new players land the moment they happen." : "Set your home ZIP in Settings to unlock your regional wire — for now you're seeing Klimr-wide news."}
              </div>
            ) : (
              feed.map((entry, i) => {
                if (entry.type === "player_group") {
                  return (
                    <article key={`grp-${i}`} className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className={monoKicker} style={{ color: "#1D4ED8" }}>New players · {entry.city}</p>
                        <p className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-faint">{timeAgo(entry.newest)}</p>
                      </div>
                      <h2 className="mt-2 font-display text-[19px] font-bold leading-snug tracking-[-0.015em] text-ink">
                        {entry.names.length} new players joined in {entry.city}
                      </h2>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">{entry.names.join(", ")}{entry.names.length >= 4 ? " and more" : ""} are ready to play.</p>
                      <Link href="/discover" className="press mt-3.5 inline-flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-surface px-3 text-xs font-bold text-ink hover:border-rule-hover">
                        Find players <ArrowUpRight size={13} />
                      </Link>
                    </article>
                  );
                }
                const item = entry.item;
                const s = KIND_STYLE[item.kind] ?? KIND_STYLE.news;
                const meta = (item.meta ?? {}) as Record<string, unknown>;
                if (item.kind === "member_post" && item.object_id) {
                  return (
                    <article key={item.id} className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className={monoKicker} style={{ color: s.accent }}>
                          Community{item.sport_key ? ` · ${sportMeta(item.sport_key).name}` : ""}{item.city ? ` · ${item.city}` : ""}
                          {item.inCircle ? <span className="ml-2 rounded-full bg-tint-brand px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.14em] text-brand-deep">Your circle</span> : null}
                        </p>
                        <p className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-faint">{timeAgo(item.published_at)}</p>
                      </div>
                      <h2 className="mt-2 text-[14px] font-bold text-ink">{item.actorName}</h2>
                      <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">{String((item.meta as Record<string, unknown>).body ?? "")}</p>
                      <FeedPostActions postId={item.object_id} initialCount={likeCount.get(item.object_id) ?? 0} initialLiked={myLiked.has(item.object_id)} mine={item.actor_id === user.id} />
                    </article>
                  );
                }
                const isAuto = !!item.actor_id;
                const price = typeof meta.price_cents === "number" ? `$${Math.round((meta.price_cents as number) / 100)}` : null;
                const auto: { title: string; body: string; href: string | null; cta: string } | null = isAuto
                  ? item.kind === "player_joined"
                    ? { title: `${item.actorName} joined Klimr`, body: `${item.sport_key ? sportMeta(item.sport_key).name : "Ready to play"}${item.city ? ` · ${item.city}` : ""}`, href: "/discover", cta: "Find players" }
                    : item.kind === "match_result"
                      ? { title: `${item.actorName} won a ranked match`, body: `${typeof meta.points === "number" ? `+${meta.points} pts` : "Ranked win"}${item.sport_key ? ` · ${sportMeta(item.sport_key).name}` : ""}${item.city ? ` · ${item.city}` : ""}`, href: null, cta: "" }
                      : item.kind === "event_published"
                        ? { title: String(meta.title ?? "New event posted"), body: `${meta.starts_at ? fmt(String(meta.starts_at), { weekday: "short", month: "short", day: "numeric" }) : "Upcoming"}${meta.location ? ` · ${meta.location}` : ""}${item.city ? ` · ${item.city}` : ""}`, href: "/events", cta: "See events" }
                        : item.kind === "tournament_published"
                          ? { title: `${String(meta.title ?? "A tournament")} — entries open`, body: `Organized by ${item.actorName}${item.city ? ` · ${item.city}` : ""}`, href: meta.code ? `/e/${meta.code}` : null, cta: "View tournament" }
                          : item.kind === "gear_listed"
                            ? { title: String(meta.title ?? "New gear listed"), body: `${price ? `${price} · ` : ""}Second Serve${item.city ? ` · ${item.city}` : ""}`, href: item.object_id ? `/marketplace/${item.object_id}` : "/marketplace", cta: "View listing" }
                            : item.kind === "pro_verified"
                              ? { title: `${item.actorName} is now a verified pro`, body: `Credential checked${item.city ? ` · ${item.city}` : ""}`, href: `/health?pro=${item.actor_id}`, cta: "View profile" }
                              : item.kind === "team_formed"
                                ? { title: `${String(meta.name ?? "A new team")} formed`, body: `Started by ${item.actorName}${item.sport_key ? ` · ${sportMeta(item.sport_key).name}` : ""}${item.city ? ` · ${item.city}` : ""}`, href: "/teams", cta: "See teams" }
                                : item.kind === "ranking_move"
                                  ? { title: `${item.actorName} is climbing the ${item.sport_key ? sportMeta(item.sport_key).name : ""} rankings`, body: `#${meta.from} → #${meta.to}${typeof meta.climbed === "number" ? ` · up ${meta.climbed} places` : ""}${item.city ? ` · ${item.city}` : ""}`, href: "/discover", cta: "See players" }
                                  : null
                  : null;
                return (
                  <article key={item.id} className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-rule-hover hover:shadow-e2">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className={monoKicker} style={{ color: s.accent }}>
                        {s.label}{!isAuto && item.sport_key ? ` · ${sportMeta(item.sport_key).name}` : ""}
                        {item.inCircle ? <span className="ml-2 rounded-full bg-tint-brand px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.14em] text-brand-deep">Your circle</span> : null}
                      </p>
                      <p className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-faint">{timeAgo(item.published_at)}</p>
                    </div>
                    {auto ? (
                      <>
                        <h2 className="mt-2 font-display text-[19px] font-bold leading-snug tracking-[-0.015em] text-ink">{auto.title}</h2>
                        <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">{auto.body}</p>
                        {auto.href ? (
                          <Link href={auto.href} className="press mt-3.5 inline-flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-surface px-3 text-xs font-bold text-ink hover:border-rule-hover">
                            {auto.cta} <ArrowUpRight size={13} />
                          </Link>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {item.title ? <h2 className="mt-2 font-display text-[19px] font-bold leading-snug tracking-[-0.015em] text-ink">{item.title}</h2> : null}
                        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-mute">{item.body}</p>
                        {item.link_url ? (
                          <Link href={item.link_url} className="press mt-3.5 inline-flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-surface px-3 text-xs font-bold text-ink hover:border-rule-hover">
                            {item.link_label ?? "Open"} <ArrowUpRight size={13} />
                          </Link>
                        ) : null}
                      </>
                    )}
                  </article>
                );
              })
            )}
          </div>
          <p className="mt-6 flex items-center gap-2 rounded-[14px] px-4 py-3 text-xs text-faint" style={{ border: "1px dashed #DCD2BE" }}>
            <Lock size={13} className="shrink-0" /> Posting is Klimr-curated for now — member posts open up as the community grows.
          </p>
        </div>

        {/* ── Sidebar (§3.1.6) ─────────────────────────────────────────── */}
        <aside className="min-w-0 space-y-4">
          {/* Your altitude — real ZIP standing */}
          <div className="relative overflow-hidden rounded-[20px] p-5 text-white" style={{ background: "linear-gradient(150deg, #FF7A4D, #E23E0D)", boxShadow: "0 18px 38px -20px rgba(214,58,15,.55)" }}>
            <svg aria-hidden viewBox="0 0 300 90" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full" style={{ opacity: 0.25 }}>
              <path d="M0,80 L60,45 L110,65 L180,25 L240,50 L300,15" fill="none" stroke="#fff" strokeWidth="2.5" />
            </svg>
            <p className={`${monoKicker} text-white/80`}>Your altitude · {sportMeta(altSport).name}</p>
            {altitude ? (
              <>
                <p className="mt-2 font-display text-[46px] font-bold leading-none tracking-[-0.02em]">
                  <span style={{ color: "#FFE249" }}>#</span>{altitude.rank}
                </p>
                <p className="mt-1 text-[13px] font-semibold text-white/90">of {altitude.field}{zip ? ` · ZIP ${zip}` : ""}</p>
                <p className={`${monoKicker} mt-2`} style={{ color: "#FFE249" }}>
                  {altitude.pts === 0 ? "Base camp · 0 pts" : `${altitude.pts.toLocaleString("en-US")} pts on the climb`}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-[22px] font-bold leading-snug">The mountain is waiting.</p>
                <p className="mt-1 text-[13px] text-white/90">{zip ? "Log a ranked match to take your first step." : "Set your home ZIP to join your local board."}</p>
              </>
            )}
            <Link href="/rankings" className="press mt-4 inline-flex h-[32px] items-center gap-1.5 rounded-full bg-white px-3.5 text-[12.5px] font-bold text-brand-deep">
              Climb the mountain <ChevronRight size={14} />
            </Link>
          </div>

          {/* Happening soon — date tiles */}
          <div className="rounded-[18px] border border-rule bg-surface p-4 shadow-e1">
            <div className="flex items-center justify-between">
              <p className={`${monoKicker} text-faint`}>Happening soon</p>
              <Link href="/events" className="text-xs font-semibold text-flame-text">All events</Link>
            </div>
            <div className="mt-2.5">
              {(upNextEvents ?? []).length === 0 ? (
                <p className="rounded-[12px] bg-bg px-3 py-4 text-xs text-mute" style={{ border: "1px solid #EFE9DC" }}>No upcoming events yet — check back soon.</p>
              ) : (
                (upNextEvents ?? []).map((ev, i) => (
                  <Link key={ev.id} href={`/events/${ev.id}`} className={`flex items-center gap-3 py-2.5 transition-colors hover:bg-[--color-surface-tint] ${i > 0 ? "border-t border-rule-soft" : ""}`}>
                    <span className="grid h-11 w-[42px] shrink-0 place-items-center rounded-[11px] bg-bg text-center" style={{ border: "1px solid #EFE9DC" }}>
                      <span className="block">
                        <span className={`${monoKicker} block text-flame-text`}>{fmt(ev.starts_at, { month: "short" })}</span>
                        <span className="block font-display text-base font-bold leading-none text-ink">{fmt(ev.starts_at, { day: "numeric" })}</span>
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{ev.title}</span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {EVENT_KIND_LABEL[ev.kind] ?? ev.kind} · {sportMeta(ev.sport_key).name}
                        {ev.court_id && courtName.get(ev.court_id) ? ` · ${courtName.get(ev.court_id)}` : ev.location_text ? ` · ${ev.location_text}` : ""}
                      </span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-faint" />
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Jump in */}
          <div className="rounded-[18px] border border-rule bg-surface p-4 shadow-e1">
            <p className={`${monoKicker} text-faint`}>Jump in</p>
            <div className="mt-2">
              {QUICK.map((q, i) => (
                <Link key={q.href} href={q.href} className={`flex items-center gap-3 py-2 transition-colors ${i > 0 ? "border-t border-rule-soft" : ""}`}>
                  <span className="grid h-[31px] w-[31px] shrink-0 place-items-center rounded-[10px] bg-tint-brand text-brand-deep">
                    <q.Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{q.label}</span>
                  <ChevronRight size={15} className="shrink-0 text-faint" />
                </Link>
              ))}
            </div>
          </div>

          {/* Sponsor slot — honest reserved card (§2.4) */}
          <div className="rounded-[18px] border border-rule bg-surface p-4" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(32,27,18,.018) 0 10px, transparent 10px 20px)" }}>
            <p className={`${monoKicker} text-faint`}>Local sponsor · Reserved</p>
            <div className="mt-2"><AdSlot slot="feed-sidebar" /></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
