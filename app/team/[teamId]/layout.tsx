import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamNav } from "@/components/team-nav";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, category").eq("id", teamId).maybeSingle();
  if (!team) notFound();

  // Recreational teams use the basic in-shell page, not the full Pro workspace.
  if (team.category !== "pro") redirect(`/teams/${teamId}`);

  // Only members enter the workspace; everyone else gets the public team page.
  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect(`/teams/${teamId}`);

  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_hue, avatar_path").eq("id", user.id).maybeSingle();
  const personal = {
    name: profile?.display_name || user.email || "You",
    hue: profile?.avatar_hue ?? 200,
    url: profile?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null,
  };

  const { data: tm } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
  const ids = [...new Set((tm ?? []).map((r) => r.team_id))];
  let teams: { id: string; name: string; sport_key: string; category: string }[] = [];
  if (ids.length) {
    const { data } = await supabase.from("teams").select("id, name, sport_key, category").in("id", ids);
    teams = (data as { id: string; name: string; sport_key: string; category: string }[] | null) ?? [];
  }

  return (
    <div className="md:flex md:min-h-dvh">
      <TeamNav team={team} role={membership.role} teams={teams} personal={personal} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
