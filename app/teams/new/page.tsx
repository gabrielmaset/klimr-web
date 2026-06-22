import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { TeamCreateWizard } from "@/components/team-create-wizard";

export const metadata: Metadata = { title: "Create a team" };

export default async function NewTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teams/new");
  if (!(await accountActive(supabase, user.id))) redirect("/teams");

  const { data: profile } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();

  return <TeamCreateWizard defaultZip={profile?.home_zip ?? ""} />;
}
