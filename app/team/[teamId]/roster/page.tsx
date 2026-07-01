import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { teamSizeFor } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { TeamSticker } from "@/components/team-sticker";
import { InviteSearch } from "@/app/teams/[id]/InviteSearch";
import { MemberControls } from "@/app/teams/[id]/MemberControls";

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null; city: string | null };
type FriendForInvite = { id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null };
type Stat = { points: number; skill: string | null; matches: number; wins: number };
type PsRow = { user_id: string; points: number; skill_level: string; matches_played: number; wins: number };

export default async function TeamRoster({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/roster`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, max_size, category").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");
  const sz = teamSizeFor(team.sport_key);
  const cap = team.max_size ?? sz.max;

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role, designation, joined_at").eq("team_id", teamId).order("joined_at");
  const members = memberRows ?? [];
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? "member";
  const isOwner = myRole === "owner";
  const canManage = myRole === "owner" || myRole === "manager";
  const canInviteMembers = canManage || myRole === "staff";
  const memberIds = members.map((m) => m.user_id);

  const profById = new Map<string, Prof>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path, city").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  // Per-member record for this team's sport — powers the sticker stat line.
  const statById = new Map<string, Stat>();
  if (memberIds.length) {
    const { data: ps } = await supabase.from("player_sports").select("user_id, points, skill_level, matches_played, wins").eq("sport_key", team.sport_key).in("user_id", memberIds);
    for (const r of (ps as PsRow[] | null) ?? []) {
      statById.set(r.user_id, { points: r.points ?? 0, skill: r.skill_level ?? null, matches: r.matches_played ?? 0, wins: r.wins ?? 0 });
    }
  }

  // Inviters: friends eligible to add + already-pending invites.
  let friendsForInvite: FriendForInvite[] = [];
  let pendingInvitees: Prof[] = [];
  if (canInviteMembers) {
    const [{ data: fr }, { data: pend }] = await Promise.all([
      supabase.from("friendships").select("requester_id, addressee_id").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted"),
      supabase.from("team_invites").select("invited_user_id").eq("team_id", teamId).eq("status", "pending"),
    ]);
    const friendIds = (fr ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    const pendingIds = new Set((pend ?? []).map((p) => p.invited_user_id));
    const candidateIds = friendIds.filter((fid) => !memberIds.includes(fid) && !pendingIds.has(fid));
    const lookupIds = [...new Set([...candidateIds, ...pendingIds])];
    if (lookupIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path, city").in("id", lookupIds);
      const map = new Map(((profs as Prof[] | null) ?? []).map((p) => [p.id, p]));
      friendsForInvite = candidateIds
        .map((cid) => map.get(cid))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          display_name: p!.display_name,
          avatar_hue: p!.avatar_hue,
          avatar_url: p!.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p!.avatar_path).data.publicUrl : null,
          city: p!.city,
        }));
      pendingInvitees = [...pendingIds].map((pid) => map.get(pid)).filter(Boolean) as Prof[];
    }
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="kicker mb-1 text-brand-deep">Roster</p>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{team.name}</h1>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm font-semibold text-ink">
          <Users size={15} className="text-mute" /> {members.length} / {cap}
        </span>
      </div>

      {/* invite */}
      {canInviteMembers ? (
        <section className="mb-6 rounded-2xl border border-rule bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Add players</h2>
          {members.length + pendingInvitees.length >= cap ? (
            <p className="text-sm text-mute">This team is full — all {cap} spots are taken. Remove a player, or raise the squad size on the Team profile, to add more.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-mute">You can invite players you&rsquo;re connected with on Klimr.</p>
              <InviteSearch teamId={team.id} friends={friendsForInvite} />
            </>
          )}
          {pendingInvitees.length > 0 ? (
            <div className="mt-4">
              <p className="kicker mb-2 text-faint">Pending invites</p>
              <div className="flex flex-wrap gap-2">
                {pendingInvitees.map((p) => (
                  <span key={p.id} className="flex items-center gap-2 rounded-full border border-rule bg-bg/50 py-1 pl-1 pr-3 text-xs text-mute">
                    <Avatar url={avatarUrl(p)} hue={p.avatar_hue} name={p.display_name} size={22} />
                    {p.display_name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* squad */}
      <section>
        <h2 className="kicker mb-3 text-faint">Squad</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((m) => {
            const p = profById.get(m.user_id);
            const s = statById.get(m.user_id);
            const isMe = m.user_id === user.id;
            return (
              <div key={m.user_id} className="relative">
                <TeamSticker
                  name={p?.display_name ?? "Player"}
                  avatarUrl={avatarUrl(p)}
                  hue={p?.avatar_hue ?? 200}
                  role={team.category === "pro" ? m.role : m.role === "owner" ? "owner" : "member"}
                  designation={team.category === "pro" ? m.designation : null}
                  city={p?.city ?? null}
                  skillLevel={s?.skill ?? null}
                  points={s ? s.points : null}
                  wins={s ? s.wins : null}
                  matches={s ? s.matches : null}
                  isMe={isMe}
                />
                {canManage && !isMe ? (
                  <div className="absolute right-2 top-9 z-20">
                    <MemberControls teamId={team.id} userId={m.user_id} name={p?.display_name ?? "Player"} role={m.role} designation={m.designation} viewerIsOwner={isOwner} isPro={team.category === "pro"} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
