import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Crown, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { respondTeamInvite, searchTeams } from "./actions";
import { TeamDiscovery } from "./team-discovery";

export const metadata: Metadata = { title: "Teams" };

type InviteTeam = { id: string; name: string; sport_key: string; city: string | null };
type MyTeam = { id: string; name: string; sport_key: string; category: string | null };

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
    const { data } = await supabase.from("teams").select("id, name, sport_key, city").in("id", inviteTeamIds);
    inviteTeams = (data as InviteTeam[] | null) ?? [];
  }

  // Your teams
  const myTeamIds = (memberships ?? []).map((m) => m.team_id);
  const roleByTeam = new Map((memberships ?? []).map((m) => [m.team_id, m.role]));
  let myTeams: MyTeam[] = [];
  const memberCount = new Map<string, number>();
  if (myTeamIds.length) {
    const [{ data: ts }, { data: counts }] = await Promise.all([
      supabase.from("teams").select("id, name, sport_key, category").in("id", myTeamIds),
      supabase.from("team_members").select("team_id").in("team_id", myTeamIds),
    ]);
    myTeams = (ts as MyTeam[] | null) ?? [];
    for (const c of counts ?? []) memberCount.set(c.team_id, (memberCount.get(c.team_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Teams</h1>
        <p className="mt-1 text-sm text-mute">Your squads, plus crews and club teams near you. Start your own below.</p>
      </div>

      {/* Pending invitations */}
      {inviteTeams.length > 0 ? (
        <section className="mb-8">
          <h2 className="kicker mb-2.5 text-brand-deep">Team invitations</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inviteTeams.map((t) => {
              const meta = sportMeta(t.sport_key);
              const inviteId = inviteByTeam.get(t.id);
              return (
                <div key={t.id} className="rounded-2xl border border-brand/30 bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-brand text-lg">{meta.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{t.name}</p>
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
      <section className="mb-8">
        <h2 className="kicker mb-2.5 text-faint">Your teams</h2>
        {myTeams.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-8 text-center text-sm text-mute">
            You&rsquo;re not on a team yet — create one below, or join one from the discovery list.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myTeams.map((t) => {
              const meta = sportMeta(t.sport_key);
              const role = roleByTeam.get(t.id);
              const href = t.category === "pro" ? `/team/${t.id}` : `/teams/${t.id}`;
              return (
                <Link key={t.id} href={href} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5] text-lg">{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-ink">{t.name}</span>
                      {role === "owner" ? <Crown size={13} className="shrink-0 text-pop" aria-label="Owner" /> : null}
                      {t.category === "pro" ? (
                        <span className="shrink-0 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-surface">Pro</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-mute">
                      <Users size={12} /> {memberCount.get(t.id) ?? 1} · {meta.name}{role ? ` · ${ROLE_LABEL[role] ?? role}` : ""}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Create */}
      <section className="mb-9">
        <h2 className="kicker mb-2.5 text-faint">Start your own team</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-rule bg-bg/40 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand">
            <Plus size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Create a team</p>
            <p className="text-xs text-mute">A quick wizard sets up a recreational crew or a full Pro workspace.</p>
          </div>
          <Link
            href="/teams/new"
            className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
          >
            <Plus size={16} /> {myTeams.length > 0 ? "Create another" : "Create a team"}
          </Link>
        </div>
      </section>

      {/* Discovery */}
      <section>
        <h2 className="kicker mb-2.5 text-faint">Discover teams near you</h2>
        <TeamDiscovery initial={initial} />
      </section>
    </div>
  );
}
