import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Plus, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { respondTeamInvite, searchTeams } from "./actions";
import { TeamDiscovery } from "./team-discovery";

export const metadata: Metadata = { title: "Teams" };

type InviteTeam = { id: string; name: string; sport_key: string; city: string | null };

export default async function TeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teams");

  const [initial, { data: invites }] = await Promise.all([
    searchTeams(""),
    supabase.from("team_invites").select("id, team_id").eq("invited_user_id", user.id).eq("status", "pending"),
  ]);

  const inviteTeamIds = (invites ?? []).map((i) => i.team_id);
  const inviteByTeam = new Map((invites ?? []).map((i) => [i.team_id, i.id]));
  let inviteTeams: InviteTeam[] = [];
  if (inviteTeamIds.length) {
    const { data } = await supabase.from("teams").select("id, name, sport_key, city").in("id", inviteTeamIds);
    inviteTeams = (data as InviteTeam[] | null) ?? [];
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Teams</h1>
          <p className="mt-1 text-sm text-mute">Find a crew or club squad near you, or browse by name.</p>
        </div>
        <Link
          href="/settings/teams"
          className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg"
        >
          <Users size={15} className="text-mute" /> Your teams
        </Link>
      </div>

      {/* pending invitations */}
      {inviteTeams.length > 0 ? (
        <section className="mb-7">
          <h2 className="kicker mb-2 text-brand-deep">Team invitations</h2>
          <div className="grid gap-3 sm:grid-cols-2">
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

      {/* discovery */}
      <section>
        <h2 className="kicker mb-2.5 text-faint">Discover teams near you</h2>
        <TeamDiscovery initial={initial} />
      </section>

      {/* create pointer — creation lives in Settings now */}
      <div className="mt-7 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-rule bg-bg/40 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand">
          <Plus size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Start your own team</p>
          <p className="text-xs text-mute">Create and manage teams from Settings — each one is its own page you can switch to.</p>
        </div>
        <Link
          href="/settings/teams"
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
        >
          <Settings size={15} /> Create a team
        </Link>
      </div>
    </div>
  );
}
