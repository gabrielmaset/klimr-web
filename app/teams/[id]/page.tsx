import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft, Crown, Users, UserPlus, X, MapPin, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { leaveTeam, removeMember, inviteToTeam } from "../actions";

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
  const isCaptain = team.created_by === user.id;

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role, joined_at").eq("team_id", id).order("joined_at");
  const members = memberRows ?? [];
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

  // Captain-only: people to invite (players the captain has matched with) + pending invites.
  let candidates: Prof[] = [];
  let pendingInvitees: Prof[] = [];
  if (isCaptain) {
    const { data: myMatches } = await supabase.from("match_participants").select("match_id").eq("user_id", user.id);
    const matchIds = [...new Set((myMatches ?? []).map((m) => m.match_id))];
    const coIds = new Set<string>();
    if (matchIds.length) {
      const { data: co } = await supabase.from("match_participants").select("user_id").in("match_id", matchIds);
      for (const c of co ?? []) if (c.user_id !== user.id) coIds.add(c.user_id);
    }
    const { data: pend } = await supabase.from("team_invites").select("invited_user_id").eq("team_id", id).eq("status", "pending");
    const pendingIds = new Set((pend ?? []).map((p) => p.invited_user_id));
    for (const mid of memberIds) coIds.delete(mid);
    const candidateIds = [...coIds].filter((cid) => !pendingIds.has(cid)).slice(0, 12);

    const lookupIds = [...new Set([...candidateIds, ...pendingIds])];
    if (lookupIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", lookupIds);
      const map = new Map((profs as Prof[] | null ?? []).map((p) => [p.id, p]));
      candidates = candidateIds.map((cid) => map.get(cid)).filter(Boolean) as Prof[];
      pendingInvitees = [...pendingIds].map((pid) => map.get(pid)).filter(Boolean) as Prof[];
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
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
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/profile/${m.user_id}`} className="press">
                  <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={38} />
                </Link>
                <Link href={`/profile/${m.user_id}`} className="press min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{p?.display_name ?? "Player"}</span>
                    {m.role === "captain" ? <Crown size={13} className="shrink-0 text-pop" aria-label="Captain" /> : null}
                    {m.user_id === user.id ? <span className="text-xs text-faint">· you</span> : null}
                  </span>
                </Link>
                {isCaptain && m.role !== "captain" ? (
                  <form action={removeMember}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="userId" value={m.user_id} />
                    <button aria-label="Remove member" className="press grid h-8 w-8 place-items-center rounded-full text-faint hover:text-brand-deep">
                      <X size={15} />
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* captain: invite players you've matched with */}
      {isCaptain ? (
        <section className="mt-6">
          <h2 className="kicker mb-2 text-faint">Invite players</h2>
          {pendingInvitees.length > 0 ? (
            <p className="mb-2 text-xs text-mute">
              Invited: {pendingInvitees.map((p) => p.display_name).join(", ")}
            </p>
          ) : null}
          {candidates.length === 0 ? (
            <p className="text-sm text-mute">No one to invite yet. Players you&apos;ve matched with will show up here.</p>
          ) : (
            <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface">
              {candidates.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar url={avatarUrl(p)} hue={p.avatar_hue ?? 200} name={p.display_name} size={34} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.display_name || "Player"}</span>
                  <form action={inviteToTeam}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="userId" value={p.id} />
                    <button className="press inline-flex items-center gap-1 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-[#f4f4f5]">
                      <UserPlus size={13} /> Invite
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* leave */}
      {amMember ? (
        <form action={leaveTeam} className="mt-8">
          <input type="hidden" name="teamId" value={team.id} />
          <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-brand/40 hover:text-brand-deep">
            {isCaptain ? "Leave team (captaincy passes on)" : "Leave team"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
