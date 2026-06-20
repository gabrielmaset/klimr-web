import { redirect } from "next/navigation";
import { Users, Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { InviteSearch } from "@/app/teams/[id]/InviteSearch";
import { MemberControls } from "@/app/teams/[id]/MemberControls";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff", member: "Member" };
const DESIG_LABEL: Record<string, string> = { captain: "Captain", co_captain: "Co-captain", sub: "Sub" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };
type FriendForInvite = { id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null };

export default async function TeamRoster({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/roster`);

  const { data: team } = await supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role, designation, joined_at").eq("team_id", teamId).order("joined_at");
  const members = memberRows ?? [];
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? "member";
  const isOwner = myRole === "owner";
  const canManage = myRole === "owner" || myRole === "manager";
  const canInviteMembers = canManage || myRole === "staff";
  const memberIds = members.map((m) => m.user_id);

  const profById = new Map<string, Prof>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

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
      type FullProf = Prof & { city: string | null };
      const map = new Map(((profs as FullProf[] | null) ?? []).map((p) => [p.id, p]));
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
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="kicker mb-1 text-brand-deep">Roster</p>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{team.name}</h1>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm font-semibold text-ink">
          <Users size={15} className="text-mute" /> {members.length}
        </span>
      </div>

      {/* invite */}
      {canInviteMembers ? (
        <section className="mb-6 rounded-2xl border border-rule bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Add players</h2>
          <p className="mb-3 text-xs text-mute">You can invite players you&rsquo;re connected with on Klimr.</p>
          <InviteSearch teamId={team.id} friends={friendsForInvite} />
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

      {/* members */}
      <section>
        <h2 className="kicker mb-2 text-faint">Members</h2>
        <div className="space-y-2">
          {members.map((m) => {
            const p = profById.get(m.user_id);
            const isMe = m.user_id === user.id;
            return (
              <div key={m.user_id} className="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5">
                <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                    {p?.display_name ?? "Player"}
                    {m.role === "owner" ? <Crown size={13} className="shrink-0 text-pop" aria-label="Owner" /> : null}
                    {isMe ? <span className="text-xs font-normal text-faint">· you</span> : null}
                  </p>
                  <p className="text-xs text-mute">
                    {ROLE_LABEL[m.role] ?? m.role}
                    {m.designation ? ` · ${DESIG_LABEL[m.designation] ?? m.designation}` : ""}
                  </p>
                </div>
                {canManage && !isMe ? (
                  <MemberControls teamId={team.id} userId={m.user_id} name={p?.display_name ?? "Player"} role={m.role} designation={m.designation} viewerIsOwner={isOwner} />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
