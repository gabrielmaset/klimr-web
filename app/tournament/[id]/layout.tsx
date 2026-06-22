import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentNav } from "@/components/tournament-nav";

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}`);

  const { data: t } = await supabase.from("tournaments").select("id, code, title, sport_key, status, owner_id").eq("id", id).maybeSingle();
  if (!t) notFound();

  // Only the owner and managers enter the workspace; everyone else gets the public page.
  let role: "owner" | "manager" | null = t.owner_id === user.id ? "owner" : null;
  if (!role) {
    const { data: m } = await supabase.from("tournament_managers").select("role").eq("tournament_id", id).eq("user_id", user.id).maybeSingle();
    if (m) role = "manager";
  }
  if (!role) redirect(`/e/${t.code}`);

  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_hue, avatar_path").eq("id", user.id).maybeSingle();
  const personal = {
    name: profile?.display_name || user.email || "You",
    hue: profile?.avatar_hue ?? 200,
    url: profile?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null,
  };

  return (
    <div className="md:flex md:min-h-dvh">
      <TournamentNav tournament={{ id: t.id, code: t.code, title: t.title, sport_key: t.sport_key, status: t.status }} role={role} personal={personal} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
