import { redirect } from "next/navigation";
import { Users, MapPin, Pencil, Trash2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, teamSizeFor } from "@/lib/sports";
import { EditTeamForm } from "@/app/teams/[id]/EditTeamForm";
import { leaveTeam, disbandTeam, restoreTeam } from "@/app/teams/actions";
import { DangerConfirm } from "@/components/danger-confirm";
import { withinRecoverWindow, recoverDaysLeft } from "@/lib/recover";
import { teamKit } from "@/lib/team-kit";

export default async function TeamProfile({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/profile`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, city, state, zip, max_size, deleted_at, created_at").eq("id", teamId).maybeSingle();
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


  const kit = teamKit(team.name);
  const initials = (team.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || team.name.slice(0, 2)).toUpperCase();
  const founded = team.created_at ? new Date(team.created_at).getFullYear() : null;
  return (
    <div className="mx-auto max-w-page px-5 py-6 sm:py-8">
      {/* crest banner */}
      <div className="relative overflow-hidden rounded-[1.75rem] p-6 sm:p-8" style={{ background: `linear-gradient(125deg, ${kit.deep} 0%, ${kit.primary} 58%, ${kit.primary} 100%)` }}>
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none text-[9rem] leading-none opacity-[0.13] sm:text-[13rem]">{meta.emoji}</span>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-[16%] w-16 -skew-x-12 sm:w-32" style={{ background: kit.bright, opacity: 0.2 }} />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-[10%] w-5 -skew-x-12 sm:w-9" style={{ background: kit.bright, opacity: 0.32 }} />
        <span aria-hidden className="pointer-events-none absolute -left-12 -top-12 h-52 w-52 rounded-full blur-3xl" style={{ background: kit.glow }} />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/85">
            <span className="font-athletic text-xs uppercase tracking-[0.2em]">{meta.name}</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span className="font-athletic text-xs uppercase tracking-[0.2em]">Pro club</span>
          </div>
          <div className="mt-3 flex items-start gap-4">
            <span className="hidden shrink-0 place-items-center rounded-2xl border-2 border-white/25 bg-white/10 sm:grid" style={{ height: 72, width: 72 }}>
              <span className="font-athletic text-3xl font-bold uppercase text-white">{initials}</span>
            </span>
            <div className="min-w-0">
              <h1 className="font-athletic text-[2.5rem] font-bold uppercase leading-[0.88] text-white sm:text-6xl">{team.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/85">
                <span className="inline-flex items-center gap-1.5"><Users size={14} /> {members.length}<span className="text-white/50">/{cap} squad</span></span>
                {place ? <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {place}</span> : null}
                {founded ? <span className="font-athletic uppercase tracking-wider text-white/70">Est. {founded}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* scoreboard */}
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl bg-ink sm:grid-cols-4">
        {[
          { label: "Matches", value: String(totalMatches) },
          { label: "Wins", value: String(totalWins) },
          { label: "Win %", value: winRate === null ? "—" : `${winRate}%` },
          { label: "Squad", value: `${members.length}/${cap}` },
        ].map((cell, i) => (
          <div
            key={cell.label}
            className={`px-4 py-4 sm:px-5 sm:py-5 ${i === 1 ? "border-l border-white/10" : ""} ${i === 2 ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""} ${i === 3 ? "border-l border-t border-white/10 sm:border-t-0" : ""}`}
          >
            <div className="font-athletic text-[10px] uppercase tracking-[0.18em] text-white/45">{cell.label}</div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-white sm:text-[2.5rem] sm:leading-none" style={{ textShadow: `0 0 18px ${kit.glow}` }}>{cell.value}</div>
          </div>
        ))}
      </div>

      {members.length < sz.min ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-l-4 border-rule bg-surface px-4 py-3 text-sm" style={{ borderLeftColor: kit.primary }}>
          <Users size={16} className="mt-0.5 shrink-0" style={{ color: kit.primary }} />
          <span className="text-ink-soft">Still forming — add {sz.min - members.length} more {sz.min - members.length === 1 ? "player" : "players"} (minimum {sz.min}) to start competing and entering tournaments.</span>
        </div>
      ) : null}

      {canManage ? (
        <section className="mt-8 rounded-2xl border border-rule bg-surface shadow-e1 p-5">
          <h2 className="font-athletic mb-3 flex items-center gap-1.5 text-xl font-bold uppercase tracking-wide text-ink">
            <Pencil size={16} className="text-brand" /> Manage team
          </h2>
          <EditTeamForm teamId={team.id} name={team.name} zip={team.zip ?? ""} city={team.city ?? ""} state={team.state ?? ""} sportKey={team.sport_key} maxSize={team.max_size ?? sz.default} memberCount={members.length} />
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-rule bg-surface shadow-e1 p-5">
        <h2 className="font-athletic text-xl font-bold uppercase tracking-wide text-ink">Membership</h2>
        {isOwner ? (
          <>
            <p className="mt-1 text-xs text-mute">You own this team. To leave, transfer ownership to another member from the Roster first.</p>
            <div className="mt-4 border-t border-rule pt-4">
              {team.deleted_at ? (
                withinRecoverWindow(team.deleted_at) ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={restoreTeam}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand/25 hover:bg-brand-deep"><RotateCcw size={14} /> Restore team</button>
                    </form>
                    <span className="text-xs text-mute">Disbanded — recoverable for {recoverDaysLeft(team.deleted_at)} more day{recoverDaysLeft(team.deleted_at) === 1 ? "" : "s"}, then archived.</span>
                  </div>
                ) : (
                  <p className="text-xs text-mute">This team was disbanded and the 90-day recovery window has passed. Its history is kept.</p>
                )
              ) : (
                <>
                  <p className="text-xs font-bold text-[#dc2626]">Disband team</p>
                  <p className="mt-0.5 text-xs text-mute">Removes the team from listings. Roster, chat, and match history are kept, and you can restore it for 90 days.</p>
                  <div className="mt-3">
                    <DangerConfirm
                      word="DELETE"
                      triggerLabel="Disband team"
                      triggerIcon={<Trash2 size={14} />}
                      triggerClassName="press inline-flex items-center gap-1.5 rounded-full border border-[#dc2626]/50 bg-surface px-4 py-2 text-sm font-semibold text-[#dc2626] transition-colors hover:bg-[#fef2f2]"
                      heading="Disband this team?"
                      description="The team leaves all listings. Nothing is deleted — roster, chat, and match history are kept, and you can restore it for 90 days."
                      consequences={["Members lose access to the team workspace", "Roster, chat, and match history are kept", "Recoverable for 90 days, then archived read-only"]}
                      confirmLabel="Disband team"
                      onConfirm={disbandTeam.bind(null, team.id)}
                    />
                  </div>
                </>
              )}
            </div>
          </>
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
