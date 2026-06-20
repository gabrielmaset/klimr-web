import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Users, ChevronRight, Crown, Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { CreateTeamForm } from "@/app/teams/CreateTeamForm";

export const metadata: Metadata = { title: "Teams · Settings" };

type Team = { id: string; name: string; sport_key: string; city: string | null; neighborhood: string | null };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff", member: "Member" };

export default async function SettingsTeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/teams");

  const [{ data: memberships }, { data: profile }] = await Promise.all([
    supabase.from("team_members").select("team_id, role").eq("user_id", user.id),
    supabase.from("profiles").select("city, neighborhood").eq("id", user.id).maybeSingle(),
  ]);

  const myTeamIds = (memberships ?? []).map((m) => m.team_id);
  const roleByTeam = new Map((memberships ?? []).map((m) => [m.team_id, m.role]));
  const teamById = new Map<string, Team>();
  const memberCount = new Map<string, number>();
  if (myTeamIds.length) {
    const [{ data: teams }, { data: counts }] = await Promise.all([
      supabase.from("teams").select("id, name, sport_key, city, neighborhood").in("id", myTeamIds),
      supabase.from("team_members").select("team_id").in("team_id", myTeamIds),
    ]);
    for (const t of (teams as Team[] | null) ?? []) teamById.set(t.id, t);
    for (const c of counts ?? []) memberCount.set(c.team_id, (memberCount.get(c.team_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <Link href="/settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ChevronLeft size={16} /> Settings
      </Link>

      <div className="mb-5">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Teams</h1>
        <p className="mt-1 text-sm text-mute">Teams you&rsquo;re on, and where you create new ones. Each team is its own page.</p>
      </div>

      {/* your teams */}
      <section className="mb-6">
        <h2 className="kicker mb-2 text-faint">Your teams</h2>
        {myTeamIds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-8 text-center text-sm text-mute">
            You&rsquo;re not on a team yet. Create one below, or{" "}
            <Link href="/teams" className="font-semibold text-brand-deep underline-offset-2 hover:underline">discover teams near you</Link>.
          </p>
        ) : (
          <div className="space-y-2.5">
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
                      {role ? ` · ${ROLE_LABEL[role] ?? role}` : ""}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* create */}
      <section className="mb-6">
        <h2 className="kicker mb-2 text-faint">Create a team</h2>
        <CreateTeamForm hasTeams={myTeamIds.length > 0} defaultCity={profile?.city ?? ""} defaultNeighborhood={profile?.neighborhood ?? ""} />
      </section>

      <Link href="/teams" className="press inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <Compass size={15} /> Discover other teams near you
      </Link>
    </div>
  );
}
