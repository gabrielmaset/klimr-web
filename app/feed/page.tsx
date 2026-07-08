import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Newspaper, Trophy, Sparkles, ArrowUpRight, Swords, Users, CalendarDays, MapPin, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdSlot } from "@/components/ads/ad-slot";
import { sportMeta } from "@/lib/sports";
import { SportDot } from "@/components/sport-chip";

export const metadata: Metadata = { title: "Feed" };
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

// Per-kind identity: medallion + soft card tint + accent. Moves the feed off the
// one-white-box-fits-all look — each story type reads at a glance.
const KIND_STYLE: Record<string, { label: string; Icon: typeof Megaphone; accent: string; soft: string; ring: string }> = {
  announcement: { label: "Announcement", Icon: Megaphone, accent: "#d63a0f", soft: "#fff4ef", ring: "#ffd9cb" },
  update: { label: "Product update", Icon: Sparkles, accent: "#4f46e5", soft: "#eef0ff", ring: "#c9cdf8" },
  news: { label: "News", Icon: Newspaper, accent: "#475569", soft: "#f3f5f8", ring: "#dbe2ea" },
  result: { label: "Match result", Icon: Trophy, accent: "#15803d", soft: "#effdf3", ring: "#bbf7d0" },
};

const EVENT_KIND_LABEL: Record<string, string> = { open_play: "Open play", ladder: "Ladder night", clinic: "Clinic", tournament: "Tournament", social: "Social" };

const QUICK = [
  { href: "/play/new", Icon: Swords, label: "Log a match" },
  { href: "/players", Icon: Users, label: "Find players" },
  { href: "/events", Icon: CalendarDays, label: "Browse events" },
  { href: "/courts", Icon: MapPin, label: "Find a court" },
];

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const [{ data: feedData, error }, { data: evData }] = await Promise.all([
    supabase.from("feed_items").select("id, kind, title, body, sport_key, link_url, link_label, published_at").order("published_at", { ascending: false }).limit(40),
    supabase.from("events").select("id, title, sport_key, kind, court_id, location_text, starts_at").eq("status", "active").gte("starts_at", nowIso()).order("starts_at").limit(3),
  ]);
  if (error) console.error("[feed] read failed", error.code, error.message);
  const items = (feedData as FeedRow[] | null) ?? [];

  // Resolve venue names for the "Happening soon" rail.
  const evrows = (evData as { id: string; title: string; sport_key: string; kind: string; court_id: string | null; location_text: string | null; starts_at: string }[] | null) ?? [];
  const courtName = new Map<string, string>();
  const courtIds = [...new Set(evrows.map((e) => e.court_id).filter(Boolean))] as string[];
  if (courtIds.length) {
    const { data: courts } = await supabase.from("courts").select("id, name").in("id", courtIds);
    for (const c of (courts as { id: string; name: string }[] | null) ?? []) courtName.set(c.id, c.name);
  }
  const upcoming = evrows.map((e) => ({
    id: e.id,
    title: e.title,
    emoji: sportMeta(e.sport_key).emoji,
    kindLabel: EVENT_KIND_LABEL[e.kind] ?? "Event",
    venue: e.court_id ? courtName.get(e.court_id) ?? null : e.location_text,
    starts_at: e.starts_at,
  }));

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Feed</h1>
          <p className="mt-1.5 text-sm text-mute">What&rsquo;s happening across Klimr — results, news, and what&rsquo;s new.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-mute">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Curated by Klimr
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main timeline */}
        <main>
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rule bg-gradient-to-br from-tint-brand to-surface p-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint-brand text-brand-deep">
                <Sparkles size={22} />
              </span>
              <p className="mt-3 text-base font-bold text-ink">The story starts here</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-mute">Match results, milestones, and news will land in this stream as your community gets going. Log a match to get the ball rolling.</p>
              <Link href="/play/new" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep shadow-md shadow-brand/25">
                <Swords size={15} /> Log a match
              </Link>
            </div>
          ) : (
            <div>
              {items.map((item, i) => {
                const s = KIND_STYLE[item.kind] ?? KIND_STYLE.announcement;
                const sport = item.sport_key ? sportMeta(item.sport_key) : null;
                const { Icon } = s;
                const last = i === items.length - 1;
                const external = !!item.link_url && /^https?:\/\//.test(item.link_url);
                return (
                  <div key={item.id} className="flex gap-4">
                    {/* timeline node + connector */}
                    <div className="flex flex-col items-center">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm" style={{ background: s.accent }}>
                        <Icon size={17} className="text-white" />
                      </span>
                      {!last ? <span className="w-px grow bg-rule" aria-hidden /> : null}
                    </div>

                    {/* card */}
                    <article className={`min-w-0 flex-1 rounded-3xl border p-4 sm:p-5 ${last ? "" : "mb-5"}`} style={{ background: s.soft, borderColor: s.ring }}>
                      <div className="flex items-center gap-2">
                        <span className="kicker" style={{ color: s.accent }}>
                          {s.label}
                        </span>
                        {sport && item.sport_key ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
                            · <SportDot sport={item.sport_key} size={7} /> {sport.name}
                          </span>
                        ) : null}
                        <span className="ml-auto text-xs text-faint">{timeAgo(item.published_at)}</span>
                      </div>

                      {item.title ? <h2 className="mt-2 text-lg font-bold leading-snug text-ink sm:text-xl">{item.title}</h2> : null}
                      <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">{item.body}</p>

                      {item.link_url ? (
                        <Link
                          href={item.link_url}
                          target={external ? "_blank" : undefined}
                          rel={external ? "noopener noreferrer" : undefined}
                          className="press mt-3.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                          style={{ background: s.accent }}
                        >
                          {item.link_label || "Learn more"} <ArrowUpRight size={15} />
                        </Link>
                      ) : null}
                    </article>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-7 flex items-center gap-2 rounded-2xl border border-rule bg-surface shadow-e1/60 px-4 py-3 text-xs text-faint">
            <Megaphone size={14} className="shrink-0" />
            Player posting opens once media uploads can be supported safely. For now, the feed is curated by Klimr.
          </p>
        </main>

        {/* Right rail */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          {/* Your ladder */}
          <div className="overflow-hidden rounded-3xl p-5 text-white shadow-[0_18px_40px_-22px_rgba(214,58,15,0.7)]" style={{ background: "linear-gradient(135deg, #ff6a3d, var(--color-brand-deep))" }}>
            <p className="kicker text-white/75">Your ladder</p>
            <p className="mt-1.5 text-lg font-bold leading-snug">Climb your ZIP, then your city, then the world.</p>
            <p className="mt-1 text-sm text-white/85">Every match you log moves your rank.</p>
            <Link href="/rankings" className="press mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-deep transition-transform hover:scale-[1.02]">
              See where you stand <ArrowUpRight size={15} />
            </Link>
          </div>

          {/* Happening soon */}
          {upcoming.length > 0 ? (
            <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-athletic text-sm font-bold uppercase tracking-wide text-ink">Happening soon</h3>
                <Link href="/events" className="text-xs font-semibold text-brand-deep hover:text-brand">
                  All events
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {upcoming.map((ev) => (
                  <Link key={ev.id} href={`/events/${ev.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-bg/40 p-2.5">
                    <div className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-surface py-1.5">
                      <span className="kicker text-brand-deep">{fmt(ev.starts_at, { month: "short" })}</span>
                      <span className="font-display text-lg leading-none text-ink">{fmt(ev.starts_at, { day: "numeric" })}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{ev.title}</p>
                      <p className="truncate text-xs text-faint">
                        {ev.emoji} {ev.kindLabel}
                        {ev.venue ? ` · ${ev.venue}` : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* Jump in */}
          <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
            <h3 className="font-athletic text-sm font-bold uppercase tracking-wide text-ink">Jump in</h3>
            <div className="mt-2 space-y-0.5">
              {QUICK.map((a) => {
                const { Icon } = a;
                return (
                  <Link key={a.href} href={a.href} className="press flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-bg">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg text-ink">
                      <Icon size={16} />
                    </span>
                    <span className="text-sm font-semibold text-ink">{a.label}</span>
                    <ChevronRight size={15} className="ml-auto text-faint" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sponsor — out of the stream so it never overpowers the content */}
          <AdSlot label="Local sponsor" />
        </aside>
      </div>
    </div>
  );
}
