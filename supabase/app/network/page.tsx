import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { NetworkBrowser, type Person, type Tab, type FriendStatus } from "@/components/network-browser";
import { PymkRail } from "@/components/pymk-rail";
import { getPeopleYouMayKnow } from "@/lib/social-server";

export const metadata: Metadata = { title: "Network" };

type Prof = {
  id: string;
  display_name: string;
  avatar_hue: number;
  avatar_path: string | null;
  verification_status: string;
  primary_sport: string | null;
  location_precision?: string | null;
  city: string | null;
};

export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabRaw } = await searchParams;
  const initialTab: Tab = tabRaw === "following" || tabRaw === "followers" ? tabRaw : "friends";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/network");

  // Bounded reads: most recent 300 per relation (exact totals come from the
  // denormalized profile counters), plus my counters and the recommendations.
  const [{ data: fr }, { data: flw }, { data: flwr }, { data: myCounts }, pymk] = await Promise.all([
    supabase
      .from("friendships")
      .select("requester_id, addressee_id, status, created_at, responded_at")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("follows").select("followee_id, created_at").eq("follower_id", user.id).order("created_at", { ascending: false }).limit(300),
    supabase.from("follows").select("follower_id, created_at").eq("followee_id", user.id).order("created_at", { ascending: false }).limit(300),
    supabase.from("profiles").select("connections_count, followers_count, following_count").eq("id", user.id).maybeSingle(),
    getPeopleYouMayKnow(supabase, user.id, 8),
  ]);

  const friendAddedAt = new Map<string, string>();
  const friendStatusById = new Map<string, FriendStatus>();
  for (const f of fr ?? []) {
    const other = f.requester_id === user.id ? f.addressee_id : f.requester_id;
    if (f.status === "accepted") {
      friendAddedAt.set(other, f.responded_at ?? f.created_at);
      friendStatusById.set(other, "friends");
    } else if (f.status === "pending") {
      friendStatusById.set(other, f.requester_id === user.id ? "requested" : "incoming");
    }
  }
  const iFollowAt = new Map<string, string>();
  for (const f of flw ?? []) iFollowAt.set(f.followee_id, f.created_at);
  const followsMeAt = new Map<string, string>();
  for (const f of flwr ?? []) followsMeAt.set(f.follower_id, f.created_at);

  const friendIds = new Set(friendAddedAt.keys());
  const iFollowIds = new Set(iFollowAt.keys());
  const followsMeIds = new Set(followsMeAt.keys());

  const allIds = [...new Set([...friendIds, ...iFollowIds, ...followsMeIds])];
  const pmap = new Map<string, Prof>();
  if (allIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_hue, avatar_path, verification_status, primary_sport, city, location_precision")
      .in("id", allIds);
    for (const p of (data as Prof[] | null) ?? []) pmap.set(p.id, p);
  }

  // Play frequency: how many matches the user has shared with each connection.
  // KCDX-030: this used to select EVERY `match_participants` row for the viewer,
  // chunk the match ids 400 at a time, pull every participant of every one of
  // those matches into Node, and count in JavaScript. The old comment said it was
  // "chunked so the query stays bounded" — chunking bounds each QUERY, not the
  // WORK. A member with 2,000 matches materialised tens of thousands of rows on
  // every render to produce a number shown beside a few dozen people.
  //
  // `played_together_counts` asks the question that was actually being asked:
  // for THESE people, how many matches do we share. One indexed join, one row per
  // person, work proportional to the answer rather than to the archive. It is
  // SECURITY DEFINER and scoped to `auth.uid()`'s own matches, so it needs no
  // admin client and cannot reveal anyone else's history.
  const playedWith = new Map<string, number>();
  if (allIds.length) {
    const { data: counts } = await supabase.rpc("played_together_counts", { p_ids: allIds });
    for (const r of counts ?? []) playedWith.set(r.other_id, r.matches);
  }

  const toPerson = (id: string, addedAt: string): Person | null => {
    const p = pmap.get(id);
    if (!p) return null;
    const m = p.primary_sport ? sportMeta(p.primary_sport) : null;
    return {
      id,
      name: p.display_name || "Player",
      avatarUrl: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
      hue: p.avatar_hue ?? 200,
      verified: p.verification_status === "verified",
      sportKey: p.primary_sport ?? null,
      sportName: m?.name ?? null,
      sportEmoji: m?.emoji ?? null,
      place: p.city || null,
      addedAt,
      playedTogether: playedWith.get(id) ?? 0,
      isFriend: friendStatusById.get(id) === "friends",
      iFollow: iFollowIds.has(id),
      followsMe: followsMeIds.has(id),
      friendStatus: friendStatusById.get(id) ?? "none",
    };
  };
  const isPerson = (x: Person | null): x is Person => x !== null;

  const friends = [...friendAddedAt.entries()].map(([id, t]) => toPerson(id, t)).filter(isPerson);
  const following = [...iFollowAt.entries()].map(([id, t]) => toPerson(id, t)).filter(isPerson);
  const followers = [...followsMeAt.entries()].map(([id, t]) => toPerson(id, t)).filter(isPerson);

  const pymkAvatars: Record<string, string | null> = {};
  for (const p of pymk) {
    pymkAvatars[p.user_id] = p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-faint">Network</p>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Community — Network</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Friends &amp; followers</h1>
        <p className="mt-1.5 text-sm text-mute">Everyone in your circle — search, filter, and jump to any player.</p>
      </div>
      <PymkRail people={pymk} avatarUrlFor={pymkAvatars} />
      <NetworkBrowser
        friends={friends}
        following={following}
        followers={followers}
        initialTab={initialTab}
        totals={{
          friends: myCounts?.connections_count ?? friends.length,
          following: myCounts?.following_count ?? following.length,
          followers: myCounts?.followers_count ?? followers.length,
        }}
      />
    </div>
  );
}
