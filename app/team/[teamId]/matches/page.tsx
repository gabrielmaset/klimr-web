import { redirect } from "next/navigation";
import { CalendarClock, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";

export default async function TeamMatches({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/matches`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");
  const meta = sportMeta(team.sport_key);

  const { data: membership } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
  const canManage = membership?.role === "owner" || membership?.role === "manager" || membership?.role === "staff";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <p className="kicker mb-1 text-brand-deep">Matches</p>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{team.name}</h1>

      <div className="mt-6 overflow-hidden rounded-3xl border border-[#ffd9cb] bg-tint-brand">
        <div className="p-6 sm:p-7">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl">{meta.emoji}</span>
          <h2 className="mt-4 font-display text-2xl text-ink">Team matches are coming</h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            Soon you&rsquo;ll schedule {meta.name} matches as <strong>{team.name}</strong>, challenge other teams, and keep every result in one place — all from this workspace.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-rule bg-surface p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-ink"><CalendarClock size={16} className="text-mute" /> Upcoming</p>
          <p className="mt-2 text-xs text-mute">No matches scheduled yet. {canManage ? "You'll be able to set one up here." : "Your captains will schedule team matches here."}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-surface p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-ink"><Trophy size={16} className="text-mute" /> Results & tournaments</p>
          <p className="mt-2 text-xs text-mute">Match history and tournament brackets will live here as the team plays.</p>
        </div>
      </div>

      <p className="mt-5 text-xs text-faint">On the roadmap: scheduling team matches, organizing tournaments, and support for new team sports like soccer.</p>
    </div>
  );
}
