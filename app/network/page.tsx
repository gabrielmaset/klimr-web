import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, ChevronRight, BadgeCheck, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Network" };

type Prof = {
  id: string;
  display_name: string;
  avatar_hue: number;
  avatar_path: string | null;
  verification_status: string;
  primary_sport: string | null;
  neighborhood: string | null;
  city: string | null;
};
type Tab = "friends" | "following" | "followers";

export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabRaw } = await searchParams;
  const tab: Tab = tabRaw === "following" || tabRaw === "followers" ? tabRaw : "friends";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/network");

  // Gather ids for all three relationships (counts shown on every tab).
  const [{ data: fr }, { data: following }, { data: followers }] = await Promise.all([
    supabase.from("friendships").select("requester_id, addressee_id, status").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted"),
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
    supabase.from("follows").select("follower_id").eq("followee_id", user.id),
  ]);

  const friendIds = (fr ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
  const followingIds = (following ?? []).map((f) => f.followee_id);
  const followerIds = (followers ?? []).map((f) => f.follower_id);
  const counts = { friends: friendIds.length, following: followingIds.length, followers: followerIds.length };

  const activeIds = tab === "friends" ? friendIds : tab === "following" ? followingIds : followerIds;

  let profs: Prof[] = [];
  if (activeIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_hue, avatar_path, verification_status, primary_sport, neighborhood, city")
      .in("id", activeIds);
    profs = (data as Prof[] | null) ?? [];
    // preserve insertion order roughly by id list
    const order = new Map(activeIds.map((id, i) => [id, i]));
    profs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  // Which of these am I already friends with (for a small badge on follow lists).
  const friendSet = new Set(friendIds);

  const TABS: { key: Tab; label: string }[] = [
    { key: "friends", label: `Friends ${counts.friends}` },
    { key: "following", label: `Following ${counts.following}` },
    { key: "followers", label: `Followers ${counts.followers}` },
  ];

  const empty =
    tab === "friends"
      ? "No friends yet. Add players from their profile — they’ll appear here once they accept."
      : tab === "following"
        ? "You’re not following anyone yet. Follow a player to track their climb."
        : "No followers yet. As you play and post, players will follow you.";

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-5">
        <p className="kicker text-faint">Network</p>
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Friends &amp; followers</h1>
      </div>

      <div className="mb-5 flex gap-1.5">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/network?tab=${t.key}`}
              className="press rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={{ borderColor: on ? "#0a0a0b" : "#e4e4e7", background: on ? "#0a0a0b" : "transparent", color: on ? "#fff" : "#71717a" }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {profs.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center">
          <Users size={26} className="mx-auto text-faint" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-mute">{empty}</p>
          <Link href="/discover" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
            <UserPlus size={15} /> Find players
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {profs.map((p) => {
            const url = p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;
            const m = p.primary_sport ? sportMeta(p.primary_sport) : null;
            const place = [p.neighborhood, p.city].filter(Boolean).join(", ");
            return (
              <Link key={p.id} href={`/profile/${p.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
                <Avatar url={url} hue={p.avatar_hue ?? 200} name={p.display_name} size={46} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{p.display_name || "Player"}</span>
                    {p.verification_status === "verified" ? <BadgeCheck size={14} className="shrink-0 text-brand" aria-label="Verified" /> : null}
                    {tab !== "friends" && friendSet.has(p.id) ? (
                      <span className="rounded-full bg-tint-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-deep">Friend</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-mute">
                    {m ? `${m.emoji} ${m.name}` : "—"}
                    {place ? ` · ${place}` : ""}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
