import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, MessageSquare, TrendingUp, Newspaper, Trophy, Sparkles, CalendarDays, MapPin, Clock, ChevronRight, UserPlus, Medal, ShoppingBag, HeartPulse, Flag } from "lucide-react";
import { lookupZip } from "@/lib/us-places";
import { FeedLivePill } from "@/components/feed-live-pill";
import { FeedComposer } from "@/components/feed-composer";
import { DiscoverPeople, DiscoverEvents, type DiscoverPerson, type DiscoverEvent } from "@/components/discover-modules";
import { TagRequests, type TagRequestItem } from "@/components/tag-requests";
import { createClient } from "@/lib/supabase/server";
import { AdSlot } from "@/components/ads/ad-slot";
import { sportMeta } from "@/lib/sports";
import { PageHeader } from "@/components/page-header";
import { FeedControls, WireDigest, type WireDigestRow } from "@/components/feed-controls";
import { FeedPostCard, type FeedPostView } from "@/components/feed-post-card";
import { CheckCircle2 } from "lucide-react";

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

export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");
  const spRaw = await searchParams;
  const laneRaw = Array.isArray(spRaw.lane) ? spRaw.lane[0] : spRaw.lane;
  const lane: "nearby" | "circle" = laneRaw === "circle" ? "circle" : "nearby";

  const [{ data: profile }, { data: items }] = await Promise.all([
    supabase.from("profiles").select("display_name, home_zip, primary_sport, avatar_hue").eq("id", user.id).maybeSingle(),
    supabase.from("feed_items").select("id, kind, title, body, sport_key, link_url, link_label, published_at, actor_id, zip, meta, audience, object_id").order("published_at", { ascending: false }).limit(120),
  ]);

  const firstName = (profile?.display_name ?? "player").split(/\s+/)[0];
  const hourLA = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: TZ }));
  const daypart = hourLA < 12 ? "Morning" : hourLA < 18 ? "Afternoon" : "Evening";
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ }).toUpperCase();

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
  const commentCount = new Map<string, number>();
  const repostInfo = new Map<string, { name: string; body: string | null }>();
  const myReposted = new Set<string>();
  const tagNamesByPost = new Map<string, string[]>();
  if (postIds.length) {
    const [{ data: likes }, { data: cmts }, { data: postRows }, { data: myReps }, { data: tagRows }] = await Promise.all([
      supabase.from("post_likes").select("post_id, user_id").in("post_id", postIds),
      supabase.from("post_comments").select("post_id").in("post_id", postIds).eq("moderation_status", "approved"),
      supabase.from("posts").select("id, repost_of").in("id", postIds).not("repost_of", "is", null),
      supabase.from("posts").select("repost_of").eq("author_id", user.id).in("repost_of", postIds),
      supabase.from("post_tags").select("post_id, user_id").in("post_id", postIds).eq("status", "approved"),
    ]);
    for (const r of (myReps ?? []) as { repost_of: string | null }[]) if (r.repost_of) myReposted.add(r.repost_of);
    const taggedIds = [...new Set(((tagRows ?? []) as { user_id: string }[]).map((t) => t.user_id))];
    const taggedNames = new Map<string, string>();
    if (taggedIds.length) {
      const { data: tps } = await supabase.from("profiles").select("id, display_name").in("id", taggedIds);
      for (const p of (tps ?? []) as { id: string; display_name: string }[]) taggedNames.set(p.id, p.display_name);
    }
    for (const t of (tagRows ?? []) as { post_id: string; user_id: string }[]) {
      const arr = tagNamesByPost.get(t.post_id) ?? [];
      const nm = taggedNames.get(t.user_id);
      if (nm) arr.push(nm);
      tagNamesByPost.set(t.post_id, arr);
    }
    const origIds = [...new Set(((postRows ?? []) as { id: string; repost_of: string | null }[]).map((r) => r.repost_of).filter((x): x is string => !!x))];
    if (origIds.length) {
      const { data: origs } = await supabase.from("posts").select("id, author_id, body").in("id", origIds);
      const origAuthorIds = [...new Set(((origs ?? []) as { author_id: string }[]).map((o) => o.author_id))];
      const origNames = new Map<string, string>();
      if (origAuthorIds.length) {
        const { data: ops } = await supabase.from("profiles").select("id, display_name").in("id", origAuthorIds);
        for (const p of (ops ?? []) as { id: string; display_name: string }[]) origNames.set(p.id, p.display_name);
      }
      const origById = new Map(((origs ?? []) as { id: string; author_id: string; body: string | null }[]).map((o) => [o.id, o]));
      for (const r of (postRows ?? []) as { id: string; repost_of: string | null }[]) {
        const o = r.repost_of ? origById.get(r.repost_of) : null;
        if (o) repostInfo.set(r.id, { name: origNames.get(o.author_id) ?? "a member", body: o.body });
      }
    }
    for (const l of likes ?? []) {
      likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
      if (l.user_id === user.id) myLiked.add(l.post_id);
    }
    for (const c of (cmts ?? []) as { post_id: string }[]) {
      commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);
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

  // Flatten the ranked stream into wire rows (dense ledger — components/feed-wire).
  const wireRows = feed.map((entry): import("@/components/feed-wire").WireRow => {
    if (entry.type === "player_group") {
      return {
        id: `grp-${entry.city}-${entry.newest}`,
        kind: "player_group",
        label: "New players",
        accent: "#1D4ED8",
        when: entry.newest,
        text: `${entry.names.length} new players joined in ${entry.city}`,
        sub: `${entry.names.join(", ")}${entry.names.length >= 4 ? " and more" : ""}`,
        href: "/discover",
        sport: null,
      };
    }
    const item = entry.item;
    const s = KIND_STYLE[item.kind] ?? KIND_STYLE.news;
    const isPost = item.kind === "member_post" && !!item.object_id;
    return {
      id: item.id,
      kind: item.kind,
      label: s.label,
      accent: s.accent,
      when: item.published_at,
      text: isPost ? (item.actorName ?? "A Klimr member") : (item.title ?? s.label),
      sub: isPost ? (item.object_id && repostInfo.has(item.object_id) ? repostInfo.get(item.object_id)?.body ?? null : item.body) : `${item.body}${item.city ? ` · ${item.city}` : ""}`,
      href: item.link_url,
      sport: item.sport_key,
      inCircle: item.inCircle,
      isPost,
      postId: isPost ? item.object_id : null,
      likeCount: isPost && item.object_id ? likeCount.get(item.object_id) ?? 0 : 0,
      liked: isPost && item.object_id ? myLiked.has(item.object_id) : false,
      commentCount: isPost && item.object_id ? commentCount.get(item.object_id) ?? 0 : 0,
      reposted: isPost && item.object_id ? myReposted.has(item.object_id) : false,
      repostOfName: isPost && item.object_id ? repostInfo.get(item.object_id)?.name ?? null : null,
      tagNames: isPost && item.object_id ? tagNamesByPost.get(item.object_id) ?? [] : [],
    };
  });

  // Discover — people-you-may-know (0099 graph RPC) + soonest upcoming events.
  const [{ data: pymkRows }, { data: upEvents }] = await Promise.all([
    supabase.rpc("people_you_may_know", { p_limit: 5 }),
    supabase
      .from("events")
      .select("id, title, sport_key, starts_at")
      .eq("status", "active")
      .is("cancelled_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
  ]);
  const discoverPeople: DiscoverPerson[] = ((pymkRows ?? []) as {
    user_id: string; display_name: string; avatar_hue: number; avatar_path: string | null;
    mutual_count: number; shared_sports: string[]; same_area: string | null; played_together: number;
  }[]).map((r) => ({
    id: r.user_id,
    name: r.display_name,
    hue: r.avatar_hue,
    avatarUrl: r.avatar_path ? supabase.storage.from("avatars").getPublicUrl(r.avatar_path).data.publicUrl : null,
    context:
      r.played_together > 0
        ? `Played together ${r.played_together}×`
        : r.mutual_count > 0
          ? `${r.mutual_count} mutual connection${r.mutual_count === 1 ? "" : "s"}`
          : r.shared_sports.length
            ? `Also plays ${r.shared_sports[0]}`
            : (r.same_area ?? "In your area"),
  }));
  const discoverEvents: DiscoverEvent[] = ((upEvents ?? []) as { id: string; title: string; sport_key: string | null; starts_at: string }[]).map((e) => ({
    id: e.id,
    title: e.title,
    sport: e.sport_key,
    whenLabel: new Date(e.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  }));

  // My pending tag requests — consent before my name appears anywhere.
  let tagRequests: TagRequestItem[] = [];
  const { data: pendingTags } = await supabase
    .from("post_tags")
    .select("id, post_id, tagged_by")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  if (pendingTags?.length) {
    const pIds = [...new Set(pendingTags.map((t) => t.post_id))];
    const tIds = [...new Set(pendingTags.map((t) => t.tagged_by))];
    const [{ data: tposts }, { data: tprofs }] = await Promise.all([
      supabase.from("posts").select("id, body").in("id", pIds),
      supabase.from("profiles").select("id, display_name").in("id", tIds),
    ]);
    const bodyOf = new Map(((tposts ?? []) as { id: string; body: string | null }[]).map((x) => [x.id, x.body]));
    const nameOf2 = new Map(((tprofs ?? []) as { id: string; display_name: string }[]).map((x) => [x.id, x.display_name]));
    tagRequests = pendingTags.map((t) => ({
      tagId: t.id,
      taggerName: nameOf2.get(t.tagged_by) ?? "A member",
      excerpt: (bodyOf.get(t.post_id) ?? "").slice(0, 80),
    }));
  }

  // ═══ Feed v2 — the real social feed (typed member posts) ═══════════════
  const typeRaw = Array.isArray(spRaw.type) ? spRaw.type[0] : spRaw.type;
  const activeType = ["match", "photo", "video", "ask", "milestone"].includes(typeRaw ?? "") ? (typeRaw as string) : "all";
  const fmtAgo = (iso: string) => {
    const mins = Math.max(0, Math.round((nowMs() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${Math.max(1, mins)}M AGO`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h}H AGO`;
    const d = Math.round(h / 24);
    return d <= 1 ? "YESTERDAY" : `${d}D AGO`;
  };
  const { data: v2Rows } = await supabase
    .from("posts")
    .select("id, author_id, body, sport_key, post_type, media_path, media_duration_seconds, milestone, match_summary, created_at")
    .eq("moderation_status", "approved")
    .eq("author_type", "member")
    .is("repost_of", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const scopedPosts = (v2Rows ?? []).filter((p) => {
    if (blocked.has(p.author_id)) return false;
    if (lane === "circle") return p.author_id === user.id || circle.has(p.author_id);
    return true;
  });
  const typeCounts: Record<string, number> = { all: scopedPosts.length, match: 0, photo: 0, video: 0, ask: 0, milestone: 0 };
  for (const p of scopedPosts) if (typeCounts[p.post_type] !== undefined) typeCounts[p.post_type] += 1;
  const visiblePosts = activeType === "all" ? scopedPosts : scopedPosts.filter((p) => p.post_type === activeType);

  const v2Ids = visiblePosts.map((p) => p.id);
  const v2Authors = [...new Set(visiblePosts.map((p) => p.author_id))];
  const v2Likes = new Map<string, number>();
  const v2Mine = new Set<string>();
  const v2Comments = new Map<string, number>();
  const v2Profiles = new Map<string, { name: string; hue: number; zip: string | null; verified: boolean }>();
  if (v2Ids.length) {
    const [{ data: lk }, { data: cm }, { data: prs }] = await Promise.all([
      supabase.from("post_likes").select("post_id, user_id").in("post_id", v2Ids),
      supabase.from("post_comments").select("post_id").in("post_id", v2Ids).eq("moderation_status", "approved"),
      supabase.from("profiles").select("id, display_name, avatar_hue, home_zip, verification_status").in("id", v2Authors),
    ]);
    for (const l of lk ?? []) {
      v2Likes.set(l.post_id, (v2Likes.get(l.post_id) ?? 0) + 1);
      if (l.user_id === user.id) v2Mine.add(l.post_id);
    }
    for (const c of cm ?? []) v2Comments.set(c.post_id, (v2Comments.get(c.post_id) ?? 0) + 1);
    for (const pr of prs ?? []) {
      v2Profiles.set(pr.id, {
        name: pr.display_name ?? "A Klimr member",
        hue: pr.avatar_hue ?? 200,
        zip: pr.home_zip ?? null,
        verified: pr.verification_status === "verified",
      });
    }
  }
  const initialsOf = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "K";
  const feedPosts: FeedPostView[] = visiblePosts.map((p) => {
    const author = v2Profiles.get(p.author_id) ?? { name: "A Klimr member", hue: 200, zip: null, verified: false };
    const area = author.zip ? lookupZip(author.zip)?.city ?? "Klimr" : "Klimr";
    const ms = (p.milestone ?? null) as { label?: string; rank?: string; place?: string } | null;
    const match = (p.match_summary ?? null) as { winner: string; opponent: string; score: string; court: string } | null;
    const mediaUrl = p.media_path ? supabase.storage.from("feed-media").getPublicUrl(p.media_path).data.publicUrl : null;
    const dur = p.media_duration_seconds;
    return {
      id: p.id,
      type: p.post_type,
      authorId: p.author_id,
      name: author.name,
      initials: initialsOf(author.name),
      hue: author.hue,
      verified: author.verified,
      sport: p.sport_key,
      meta: `${area} · ${fmtAgo(p.created_at)}`,
      text: p.body,
      mediaUrl,
      durationLabel: dur ? `0:${String(Math.min(59, dur)).padStart(2, "0")}` : null,
      match,
      milestone: ms,
      aces: v2Likes.get(p.id) ?? 0,
      aced: v2Mine.has(p.id),
      comments: v2Comments.get(p.id) ?? 0,
    };
  });
  const viewer = { initials: initialsOf(profile?.display_name ?? "You"), hue: profile?.avatar_hue ?? 200 };

  const DIGEST_KIND: Record<string, WireDigestRow["icon"]> = {
    event_published: "event", player_joined: "player", player_group: "players", team_formed: "team",
    announcement: "announcement", news: "news", update: "product", pro_verified: "training",
    tournament_published: "event", ranking_move: "product", gear_listed: "product",
  };
  const digestRows: WireDigestRow[] = wireRows
    .filter((w) => w.kind !== "member_post")
    .slice(0, 12)
    .map((w) => ({
      id: w.id,
      icon: DIGEST_KIND[w.kind] ?? "product",
      title: w.text,
      sub: w.sub ?? "",
      time: fmtAgo(w.when),
    }));

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <PageHeader
          kicker={`Home — ${todayLabel}`}
          title={`${daypart}, ${firstName}.`}
          sub="Your people, your courts — every post carries a game."
        />
        <FeedLivePill />
      </div>

      <div className="mt-5 grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_336px]">
        {/* ── Left: composer, controls, the feed ─────────────────────────── */}
        <main className="flex min-w-0 flex-col gap-3.5">
          <FeedComposer initials={viewer.initials} hue={viewer.hue} />
          <TagRequests items={tagRequests} />
          <FeedControls scope={lane} type={activeType} counts={typeCounts} />

          {feedPosts.length === 0 ? (
            <div className="rounded-2xl border border-rule bg-surface px-5 py-8 text-center shadow-e1">
              <p className="text-sm font-semibold text-ink">
                {activeType === "all" ? "No posts from your courts yet." : `No ${activeType === "ask" ? "questions" : activeType + "s"} from your courts yet.`}
              </p>
              <p className="mt-1 text-[12.5px] text-mute">Be the first — share a photo, a highlight, a question, or a milestone.</p>
            </div>
          ) : (
            feedPosts.map((p) => <FeedPostCard key={p.id} post={p} viewer={viewer} />)
          )}

          {activeType === "all" ? <WireDigest rows={digestRows} /> : null}

          <div className="pb-2 pt-4 text-center">
            <div className="inline-flex items-center gap-2">
              <span aria-hidden className="h-px w-9 bg-[#DCD2BE]" />
              <CheckCircle2 size={17} className="text-success" />
              <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#8A8069]">YOU&apos;RE ALL CAUGHT UP</span>
              <span aria-hidden className="h-px w-9 bg-[#DCD2BE]" />
            </div>
            <p className="mt-1.5 text-xs text-faint">That&apos;s everything from your courts — no filler after this line. Go play.</p>
          </div>
        </main>

        {/* ── Right: sticky sidebar ──────────────────────────────────────── */}
        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-20">
          <div className="relative overflow-hidden rounded-[20px] bg-[linear-gradient(140deg,#FF6A35,#D63A0F)] p-5 shadow-[0_18px_38px_-20px_rgba(214,58,15,.55)]">
            <svg viewBox="0 0 300 150" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <path d="M0,138 L60,108 L110,126 L170,78 L220,102 L300,44" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" />
              <circle cx="300" cy="44" r="3" fill="#FFE249" />
            </svg>
            <div className="relative">
              <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/75">Your altitude · {sportMeta(altSport).name}</p>
              {altitude ? (
                <>
                  <p className="mt-2 font-display text-[34px] font-bold leading-none tracking-[-0.02em] text-white">
                    <span style={{ color: "#FFE249" }}>#</span>{altitude.rank}
                  </p>
                  <p className="mt-1 text-[12.5px] font-semibold text-white/90">of {altitude.field}{zip ? ` · ZIP ${zip}` : ""}</p>
                  <p className="mt-0.5 text-[12.5px] text-white/85">
                    {altitude.pts === 0 ? "Base camp · 0 pts" : `${altitude.pts.toLocaleString("en-US")} pts on the climb`}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-display text-[21px] font-bold leading-tight tracking-[-0.02em] text-white">The mountain is waiting.</p>
                  <p className="mt-1 text-[12.5px] text-white/85">Log a ranked match to take your first step.</p>
                </>
              )}
              <Link href="/rankings" className="press mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[12.5px] font-bold text-[#D63A0F] shadow-[0_2px_8px_rgba(90,20,0,.2)]">
                Climb the mountain <ChevronRight size={13} />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-surface px-4 pb-2 pt-4 shadow-e1">
            <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">This feed&apos;s promise</p>
            {[
              { Icon: Clock, title: "Chronological, always", sub: "Newest first — no algorithm deciding for you." },
              { Icon: MapPin, title: "Your courts only", sub: "Nearby and your circle. No suggested strangers." },
              { Icon: Flag, title: "It ends", sub: "Caught up means caught up — no infinite filler." },
              { Icon: Megaphone, title: "No ads between posts", sub: "Sponsors get one labeled slot, never your feed." },
            ].map(({ Icon, title, sub }) => (
              <div key={title} className="flex gap-2.5 border-b border-rule-soft py-[9px] last:border-b-0">
                <Icon size={15} className="mt-0.5 shrink-0 text-brand-deep" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-ink">{title}</p>
                  <p className="mt-px text-[11.5px] leading-snug text-[#8A8069]">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <DiscoverEvents events={discoverEvents} />
          <DiscoverPeople people={discoverPeople} />
          <AdSlot slot="feed-sidebar" />
        </aside>
      </div>

      <footer className="mt-[22px] flex items-center gap-3 border-t border-rule pb-5 pt-4">
        <span className="font-mono text-[9.5px] tracking-[0.14em] text-faint">© 2026 KLIMR · LOS ANGELES</span>
        <span className="flex-1" />
        <Link href="/support" className="text-xs font-semibold text-mute hover:text-ink">Contact</Link>
      </footer>
    </div>
  );
}
