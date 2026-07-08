import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Crown, ChevronRight, Plus, Trophy, Building2, CalendarPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { SportDot } from "@/components/sport-chip";
import { TeamCrest } from "@/components/team-crest";
import { respondTeamInvite, searchTeams } from "./actions";
import { TeamDiscovery } from "./team-discovery";

export const metadata: Metadata = { title: "Teams" };

type InviteTeam = { id: string; name: string; sport_key: string; city: string | null };
type MyTeam = {
  id: string;
  name: string;
  sport_key: string;
  category: string | null;
  deleted_at: string | null;
  city: string | null;
  neighborhood: string | null;
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff", member: "Member" };

export default async function TeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teams");

  const [initial, { data: invites }, { data: memberships }] = await Promise.all([
    searchTeams(""),
    supabase.from("team_invites").select("id, team_id").eq("invited_user_id", user.id).eq("status", "pending"),
    supabase.from("team_members").select("team_id, role").eq("user_id", user.id),
  ]);

  // Pending invitations
  const inviteTeamIds = (invites ?? []).map((i) => i.team_id);
  const inviteByTeam = new Map((invites ?? []).map((i) => [i.team_id, i.id]));
  let inviteTeams: InviteTeam[] = [];
  if (inviteTeamIds.length) {
    const { data } = await supabase.from("teams").select("id, name, sport_key, city").is("deleted_at", null).in("id", inviteTeamIds);
    inviteTeams = (data as InviteTeam[] | null) ?? [];
  }

  // Your teams
  const myTeamIds = (memberships ?? []).map((m) => m.team_id);
  const roleByTeam = new Map((memberships ?? []).map((m) => [m.team_id, m.role]));
  let myTeams: MyTeam[] = [];
  const memberCount = new Map<string, number>();
  if (myTeamIds.length) {
    const [{ data: ts }, { data: counts }] = await Promise.all([
      supabase.from("teams").select("id, name, sport_key, category, deleted_at, city, neighborhood").in("id", myTeamIds),
      supabase.from("team_members").select("team_id").in("team_id", myTeamIds),
    ]);
    myTeams = (ts as MyTeam[] | null) ?? [];
    for (const c of counts ?? []) memberCount.set(c.team_id, (memberCount.get(c.team_id) ?? 0) + 1);
  }

  const ownedCount = myTeams.filter((t) => roleByTeam.get(t.id) === "owner").length;
  const sportsCount = new Set(myTeams.map((t) => t.sport_key)).size;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Teams</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">
            Your squads and the crews you play with — plus club teams near you looking for players. Start your own below.
          </p>
        </div>
        <Link
          href="/teams/new"
          className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          <Plus size={16} /> Create team
        </Link>
      </div>

      {myTeams.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <Users size={13} className="text-mute" /> {myTeams.length} team{myTeams.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <Crown size={13} className="text-pop" /> {ownedCount} you own
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <Trophy size={13} className="text-mute" /> {sportsCount} sport{sportsCount === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      {/* Pending invitations */}
      {inviteTeams.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-athletic mb-2.5 text-base font-bold uppercase tracking-wide text-brand-deep">Team invitations</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inviteTeams.map((t) => {
              const meta = sportMeta(t.sport_key);
              const inviteId = inviteByTeam.get(t.id);
              return (
                <div key={t.id} className="rounded-2xl border border-brand/30 bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <TeamCrest name={t.name} size={40} radius={14} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-athletic text-[15px] text-ink">{t.name}</p>
                      <p className="truncate text-xs text-mute">{meta.name}{t.city ? ` · ${t.city}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <form action={respondTeamInvite}>
                      <input type="hidden" name="inviteId" value={inviteId} />
                      <input type="hidden" name="decision" value="accept" />
                      <button className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">Accept</button>
                    </form>
                    <form action={respondTeamInvite}>
                      <input type="hidden" name="inviteId" value={inviteId} />
                      <input type="hidden" name="decision" value="decline" />
                      <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink">Decline</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Your teams */}
      <section className="mt-8">
        <h2 className="font-athletic mb-2.5 text-base font-bold uppercase tracking-wide text-ink">Your teams</h2>
        {myTeams.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-8 text-center text-sm text-mute">
            You&rsquo;re not on a team yet — create one below, or join one from the discovery list.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myTeams.map((t) => {
              const meta = sportMeta(t.sport_key);
              const role = roleByTeam.get(t.id) ?? "member";
              const href = t.category === "pro" ? `/team/${t.id}` : `/teams/${t.id}`;
              const count = memberCount.get(t.id) ?? 1;
              const place = t.neighborhood || t.city;
              return (
                <div key={t.id} className="flex flex-col overflow-hidden rounded-2xl border border-rule bg-surface transition-shadow hover:shadow-[0_2px_18px_-6px_rgba(0,0,0,0.12)]">
                  {/* sport badge + role */}
                  <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                      <SportDot sport={t.sport_key} />
                      {meta.name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-mute">
                      {role === "owner" ? <Crown size={12} className="text-pop" /> : null}
                      {t.category === "pro" ? (ROLE_LABEL[role] ?? "Member") : role === "owner" ? "Team manager" : "Player"}
                    </span>
                  </div>

                  {/* crest + name + members · place (opens the team) */}
                  <Link href={href} className="flex items-start gap-3 px-4 pb-3.5 pt-2.5">
                    <TeamCrest name={t.name} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-athletic text-[15px] leading-tight text-ink">{t.name}</span>
                        {t.category === "pro" ? (
                          <span className="shrink-0 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-surface">Pro</span>
                        ) : null}
                        {t.deleted_at ? (
                          <span className="shrink-0 rounded-full bg-tint-danger px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-danger">Disbanded</span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-mute">
                        <Users size={12} className="shrink-0" /> {count} member{count === 1 ? "" : "s"}{place ? ` · ${place}` : ""}
                      </span>
                    </span>
                  </Link>

                  {/* rank + last 5 — fills in once the team starts playing ranked matches */}
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-rule px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-faint">Rank</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-mute">Unranked</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-faint">Last 5</p>
                      <span className="mt-1 flex items-center justify-end gap-1" aria-label="No matches played yet">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span key={i} className="h-4 w-4 rounded-[4px] border border-rule bg-bg" />
                        ))}
                      </span>
                    </div>
                  </div>

                  {/* next match / schedule (team match scheduling is on the roadmap) */}
                  <Link
                    href={`/team/${t.id}/matches`}
                    className="flex items-center justify-between gap-2 border-t border-rule bg-bg/40 px-4 py-2.5 text-xs font-semibold text-mute transition-colors hover:text-ink"
                  >
                    <span className="flex items-center gap-1.5">
                      <CalendarPlus size={14} className="text-faint" /> Schedule a match
                    </span>
                    <ChevronRight size={16} className="text-faint" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create */}
      <section className="mt-9">
        <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-surface shadow-e1 p-5 sm:flex-row sm:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand">
            <Plus size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-athletic text-[15px] text-ink">Start your own team</p>
            <p className="mt-0.5 text-xs text-mute">A quick wizard spins up a recreational crew or a full club workspace in about a minute.</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Link href="/teams/new" className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand">
              <Users size={15} /> Recreational crew
            </Link>
            <Link href="/teams/new" className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
              <Building2 size={15} /> Club workspace
            </Link>
          </div>
        </div>
      </section>

      {/* Discovery */}
      <section className="mt-9">
        <h2 className="font-athletic mb-2.5 text-base font-bold uppercase tracking-wide text-ink">Discover teams near you</h2>
        <TeamDiscovery initial={initial} />
      </section>
    </div>
  );
}
