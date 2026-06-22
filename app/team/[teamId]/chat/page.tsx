import { redirect } from "next/navigation";
import { MessageCircle, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

export default async function TeamChat({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/chat`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");

  const { data: memberRows } = await supabase.from("team_members").select("user_id").eq("team_id", teamId).order("joined_at");
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const profById = new Map<string, Prof>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker mb-1 text-brand-deep">Team chat</p>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{team.name}</h1>

      <div className="mt-6 overflow-hidden rounded-3xl border border-[#ffd9cb] bg-tint-brand">
        <div className="p-6 sm:p-7">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand">
            <MessageCircle size={24} />
          </span>
          <h2 className="mt-4 font-display text-2xl text-ink">One thread for the whole team</h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            Team chat is coming next. Everyone on the roster — players, staff, and captains — will share a single conversation here to coordinate matches and practices.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-rule bg-surface p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Users size={16} className="text-mute" /> Everyone who&rsquo;ll be in the chat ({memberIds.length})
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {memberIds.slice(0, 16).map((id) => {
            const p = profById.get(id);
            return (
              <div key={id} className="flex w-16 flex-col items-center gap-1 text-center">
                <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={40} />
                <span className="w-full truncate text-[11px] text-mute">{(p?.display_name ?? "Player").split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
