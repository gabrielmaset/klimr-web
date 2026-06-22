import { redirect } from "next/navigation";
import { Users, MapPin, Trophy, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, teamSizeFor } from "@/lib/sports";
import { EditTeamForm } from "@/app/teams/[id]/EditTeamForm";
import { leaveTeam } from "@/app/teams/actions";

export default async function TeamProfile({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/profile`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, city, state, zip, max_size").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");
  const meta = sportMeta(team.sport_key);
  const sz = teamSizeFor(team.sport_key);
  const cap = team.max_size ?? sz.max;

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role").eq("team_id", teamId);
  const members = memberRows ?? [];
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "manager";
  const isOwner = myRole === "owner";
  const place = [team.city, team.state].filter(Boolean).join(", ");

  let totalMatches = 0;
  let totalWins = 0;
  const memberIds = members.map((m) => m.user_id);
  if (memberIds.length) {
    const { data: ps } = await supabase.from("player_sports").select("matches_played, wins").eq("sport_key", team.sport_key).in("user_id", memberIds);
    for (const row of ps ?? []) {
      totalMatches += row.matches_played ?? 0;
      totalWins += row.wins ?? 0;
    }
  }
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <p className="kicker mb-1 text-brand-deep">Team profile</p>
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-tint-brand text-3xl">{meta.emoji}</span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl leading-tight text-ink sm:text-4xl">{team.name}</h1>
          <p className="text-sm text-mute">{meta.name}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-rule bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-mute"><Users size={13} /> Members</p>
          <p className="mt-1 font-display text-2xl text-ink">{members.length} <span className="text-base text-faint">/ {cap}</span></p>
          {members.length < sz.min ? <p className="mt-0.5 text-[11px] font-semibold text-brand-deep">Forming — add {sz.min - members.length} more</p> : null}
        </div>
        <div className="rounded-2xl border border-rule bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-mute"><Trophy size={13} /> {meta.name} record</p>
          <p className="mt-1 font-display text-2xl text-ink">{winRate === null ? "—" : `${winRate}%`}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs text-mute"><MapPin size={13} /> Area</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink">{place || "Not set"}</p>
        </div>
      </div>

      {canManage ? (
        <section className="mt-6 rounded-2xl border border-rule bg-surface p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
            <Pencil size={14} className="text-brand" /> Edit team details
          </h2>
          <EditTeamForm teamId={team.id} name={team.name} zip={team.zip ?? ""} city={team.city ?? ""} state={team.state ?? ""} sportKey={team.sport_key} maxSize={team.max_size ?? sz.default} memberCount={members.length} />
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Membership</h2>
        {isOwner ? (
          <p className="mt-1 text-xs text-mute">You own this team. To leave, transfer ownership to another member from the Roster first.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-mute">Leaving removes you from the roster and this workspace.</p>
            <form action={leaveTeam} className="mt-3">
              <input type="hidden" name="teamId" value={team.id} />
              <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-brand-deep transition-colors hover:bg-tint-brand">
                Leave team
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
