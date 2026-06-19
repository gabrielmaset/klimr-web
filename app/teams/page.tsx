import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, ChevronRight, Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { respondTeamInvite } from "./actions";
import { CreateTeamForm } from "./CreateTeamForm";

export const metadata: Metadata = { title: "Teams" };

type Team = { id: string; name: string; sport_key: string; city: string | null; neighborhood: string | null };

export default async function TeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teams");

  const [{ data: memberships }, { data: invites }, { data: profile }] = await Promise.all([
    supabase.from("team_members").select("team_id, role").eq("user_id", user.id),
    supabase.from("team_invites").select("id, team_id").eq("invited_user_id", user.id).eq("status", "pending"),
    supabase.from("profiles").select("city, neighborhood").eq("id", user.id).maybeSingle(),
  ]);

  const myTeamIds = (memberships ?? []).map((m) => m.team_id);
  const roleByTeam = new Map((memberships ?? []).map((m) => [m.team_id, m.role]));
  const inviteTeamIds = (invites ?? []).map((i) => i.team_id);
  const inviteByTeam = new Map((invites ?? []).map((i) => [i.team_id, i.id]));

  const allIds = [...new Set([...myTeamIds, ...inviteTeamIds])];
  const teamById = new Map<string, Team>();
  const memberCount = new Map<string, number>();
  if (allIds.length) {
    const [{ data: teams }, { data: counts }] = await Promise.all([
      supabase.from("teams").select("id, name, sport_key, city, neighborhood").in("id", allIds),
      supabase.from("team_members").select("team_id").in("team_id", allIds),
    ]);
    for (const t of (teams as Team[] | null) ?? []) teamById.set(t.id, t);
    for (const c of counts ?? []) memberCount.set(c.team_id, (memberCount.get(c.team_id) ?? 0) + 1);
  }


  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-5">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Teams</h1>
        <p className="mt-1 text-sm text-mute">Your crews and club squads. Invite players you&apos;ve matched with.</p>
      </div>

      {/* pending invites */}
      {inviteTeamIds.length > 0 ? (
        <section className="mb-6">
          <h2 className="kicker mb-2 text-brand-deep">Team invitations</h2>
          <div className="space-y-3">
            {inviteTeamIds.map((tid) => {
              const t = teamById.get(tid);
              if (!t) return null;
              const meta = sportMeta(t.sport_key);
              const inviteId = inviteByTeam.get(tid)!;
              return (
                <div key={tid} className="rounded-2xl border border-brand/30 bg-surface p-4">
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

      {/* my teams */}
      <section>
        <h2 className="kicker mb-2 text-faint">Your teams</h2>
        {myTeamIds.length === 0 ? (
          <p className="mb-4 text-sm text-mute">You&apos;re not on a team yet. Create one below.</p>
        ) : (
          <div className="mb-6 space-y-2.5">
            {myTeamIds.map((tid) => {
              const t = teamById.get(tid);
              if (!t) return null;
              const meta = sportMeta(t.sport_key);
              const role = roleByTeam.get(tid);
              return (
                <Link key={tid} href={`/teams/${tid}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5] text-lg">{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-ink">{t.name}</span>
                      {role === "owner" ? <Crown size={13} className="shrink-0 text-pop" aria-label="Owner" /> : null}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-mute">
                      <Users size={12} /> {memberCount.get(tid) ?? 1} · {meta.name}
                      {t.city ? ` · ${t.city}` : ""}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* create a team — collapses to a button once you have teams */}
      <CreateTeamForm
        hasTeams={myTeamIds.length > 0}
        defaultCity={profile?.city ?? ""}
        defaultNeighborhood={profile?.neighborhood ?? ""}
      />
    </div>
  );
}
