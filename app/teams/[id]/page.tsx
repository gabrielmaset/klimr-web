import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft, Crown, Users, MapPin, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { leaveTeam } from "../actions";
import { EditTeamForm } from "./EditTeamForm";
import { InviteSearch } from "./InviteSearch";
import { MemberControls } from "./MemberControls";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
const DESIG_LABEL: Record<string, string> = { captain: "Captain", co_captain: "Co-captain", sub: "Sub" };

export const metadata: Metadata = { title: "Team" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/teams/${id}`);

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, sport_key, city, neighborhood, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!team) notFound();

  const meta = sportMeta(team.sport_key);

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role, designation, joined_at").eq("team_id", id).order("joined_at");
  const members = memberRows ?? [];
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? null;
  const isOwner = myRole === "owner";
  const canManage = myRole === "owner" || myRole === "manager";
  const canInviteMembers = canManage || myRole === "staff";
  const memberIds = members.map((m) => m.user_id);
  const amMember = memberIds.includes(user.id);

  const profById = new Map<string, Prof>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) =>
    p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  // Combined team stats for the team's sport.
  let totalMatches = 0;
  let totalWins = 0;
  if (memberIds.length) {
    const { data: ps } = await supabase
      .from("player_sports")
      .select("matches_played, wins")
      .eq("sport_key", team.sport_key)
      .in("user_id", memberIds);
    for (const row of ps ?? []) {
      totalMatches += row.matches_played ?? 0;
      totalWins += row.wins ?? 0;
    }
  }

  // Captain-only: friends to invite + pending invites. You can only add people
  // you're already connected with (friendship requires approval).
  type FriendForInvite = { id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null };
  let friendsForInvite: FriendForInvite[] = [];
  let pendingInvitees: Prof[] = [];
  if (canInviteMembers) {
    const [{ data: fr }, { data: pend }] = await Promise.all([
      supabase.from("friendships").select("requester_id, addressee_id").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted"),
      supabase.from("team_invites").select("invited_user_id").eq("team_id", id).eq("status", "pending"),
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
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <Link href="/teams" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink">
        <ChevronLeft size={15} /> Teams
      </Link>

      {/* header */}
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-tint-brand text-3xl">{meta.emoji}</span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl leading-tight text-ink sm:text-4xl">{team.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-mute">
            <span>{meta.name}</span>
            <span className="flex items-center gap-1"><Users size={13} /> {members.length}</span>
            {team.city || team.neighborhood ? (
              <span className="flex items-center gap-1"><MapPin size={13} /> {[team.neighborhood, team.city].filter(Boolean).join(", ")}</span>
            ) : null}
          </p>
        </div>
      </div>

      {canManage ? (
        <div className="mt-4">
          <EditTeamForm
            teamId={team.id}
            name={team.name}
            city={team.city ?? ""}
            neighborhood={team.neighborhood ?? ""}
          />
        </div>
      ) : null}

      {/* combined stats */}
      {totalMatches > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-rule bg-surface p-4">
            <div className="kicker text-faint">Combined matches</div>
            <div className="mt-1 font-display text-3xl text-ink tabular">{totalMatches}</div>
          </div>
          <div className="rounded-2xl border border-rule bg-surface p-4">
            <div className="flex items-center gap-1.5"><Trophy size={12} className="text-pop" /><span className="kicker text-faint">Combined wins</span></div>
            <div className="mt-1 font-display text-3xl text-ink tabular">{totalWins}</div>
          </div>
        </div>
      ) : null}

      {/* roster */}
      <section className="mt-6">
        <h2 className="kicker mb-2 text-faint">Roster</h2>
        <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface">
          {members.map((m) => {
            const p = profById.get(m.user_id);
            const showControls = canManage && m.user_id !== user.id && m.role !== "owner" && !(myRole === "manager" && m.role === "manager");
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/profile/${m.user_id}`} className="press">
                  <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={38} />
                </Link>
                <Link href={`/profile/${m.user_id}`} className="press min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{p?.display_name ?? "Player"}</span>
                    {m.role === "owner" ? <Crown size={13} className="shrink-0 text-pop" aria-label="Owner" /> : null}
                    {m.user_id === user.id ? <span className="text-xs text-faint">· you</span> : null}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {ROLE_LABEL[m.role] ? (
                      <span className="rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">{ROLE_LABEL[m.role]}</span>
                    ) : null}
                    {m.designation && DESIG_LABEL[m.designation] ? (
                      <span className="rounded-full bg-tint-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-deep">{DESIG_LABEL[m.designation]}</span>
                    ) : null}
                  </span>
                </Link>
                {showControls ? (
                  <MemberControls
                    teamId={team.id}
                    userId={m.user_id}
                    name={p?.display_name ?? "Player"}
                    role={m.role}
                    designation={m.designation}
                    viewerIsOwner={isOwner}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* captain: add players — searchable list of friends only */}
      {canInviteMembers ? (
        <section className="mt-6">
          <h2 className="kicker mb-2 text-faint">Add players</h2>
          <InviteSearch teamId={team.id} friends={friendsForInvite} />

          {pendingInvitees.length > 0 ? (
            <p className="mt-3 text-xs text-mute">
              Invited &amp; pending: {pendingInvitees.map((p) => p.display_name).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* roles explainer — real club structure */}
      <section className="mt-8 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="kicker text-brand-deep">Roles like an actual club</h2>
        <p className="mt-1 text-sm text-mute">A verified player owns the team. Only verified players can join, so the identity guarantee extends to every roster.</p>
        <div className="mt-3 space-y-px overflow-hidden rounded-xl border border-rule">
          {[
            { r: "Owner", d: "Full control · transfers ownership" },
            { r: "Manager", d: "Roster, scheduling, invites" },
            { r: "Staff", d: "Support role · can invite" },
            { r: "Member", d: "Captain · Co-captain · Sub" },
          ].map((row) => (
            <div key={row.r} className="flex items-center justify-between gap-3 bg-bg px-4 py-3">
              <span className="text-sm font-semibold text-ink">{row.r}</span>
              <span className="text-right text-xs text-mute">{row.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* leave */}
      {amMember ? (
        <form action={leaveTeam} className="mt-8">
          <input type="hidden" name="teamId" value={team.id} />
          <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-brand/40 hover:text-brand-deep">
            {isOwner ? "Leave team (ownership passes on)" : "Leave team"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
