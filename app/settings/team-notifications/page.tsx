import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { createClient } from "@/lib/supabase/server";
import { TeamNotificationsForm } from "./form";

export const metadata: Metadata = { title: "Team notifications · Settings" };

export default async function TeamNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/team-notifications");
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("notif_team_invites, notif_team_roster, notif_team_activity")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Team notifications" }]} />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Team notifications</h1>
      <p className="mt-2 text-sm text-mute">Invites, roster moves, and activity from your teams — each on its own switch.</p>
      <div className="mt-6">
        <TeamNotificationsForm
          initial={{
            notif_team_invites: prefs?.notif_team_invites ?? true,
            notif_team_roster: prefs?.notif_team_roster ?? true,
            notif_team_activity: prefs?.notif_team_activity ?? true,
          }}
        />
      </div>
    </div>
  );
}
