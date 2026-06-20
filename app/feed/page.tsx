import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Newspaper, Trophy, Sparkles, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdSlot } from "@/components/ads/ad-slot";
import { sportMeta } from "@/lib/sports";

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

function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const KIND_META: Record<string, { label: string; Icon: typeof Megaphone; tint: string; ink: string }> = {
  announcement: { label: "Announcement", Icon: Megaphone, tint: "#fff1ed", ink: "#d63a0f" },
  news: { label: "News", Icon: Newspaper, tint: "#f4f4f5", ink: "#52525b" },
  result: { label: "Match result", Icon: Trophy, tint: "#f0fdf4", ink: "#15803d" },
  update: { label: "Product update", Icon: Sparkles, tint: "#fff1ed", ink: "#d63a0f" },
};

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const { data, error } = await supabase
    .from("feed_items")
    .select("id, kind, title, body, sport_key, link_url, link_label, published_at")
    .order("published_at", { ascending: false })
    .limit(40);
  if (error) console.error("[feed] read failed", error.code, error.message);
  const items = (data as FeedRow[] | null) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Feed</h1>
        <p className="mt-1 text-sm text-mute">Match results, news, and updates from Klimr.</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
          Nothing here yet. Results and updates will appear as the community gets going.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => {
            const meta = KIND_META[item.kind] ?? KIND_META.announcement;
            const sport = item.sport_key ? sportMeta(item.sport_key) : null;
            const { Icon } = meta;
            return (
              <div key={item.id}>
                <article className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: meta.tint, color: meta.ink }}>
                      <Icon size={14} />
                    </span>
                    <span className="kicker" style={{ color: meta.ink }}>{meta.label}</span>
                    {sport ? <span className="text-xs text-faint">· {sport.emoji} {sport.name}</span> : null}
                    <span className="ml-auto text-xs text-faint">{timeAgo(item.published_at)}</span>
                  </div>

                  {item.title ? <h2 className="mt-2.5 text-lg font-bold leading-snug text-ink">{item.title}</h2> : null}
                  <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">{item.body}</p>

                  {item.link_url ? (
                    <Link
                      href={item.link_url}
                      className="press mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:text-brand"
                    >
                      {item.link_label || "Learn more"} <ArrowUpRight size={15} />
                    </Link>
                  ) : null}
                </article>

                {/* ads-first: a reserved sponsor slot every few items */}
                {i % 4 === 3 ? <AdSlot className="mt-4" label="Local sponsor" /> : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-faint">
        Player posting opens once media uploads can be supported safely. For now, the feed is curated by Klimr.
      </p>
    </div>
  );
}
