"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountActive } from "@/lib/guards";
import { createNotification } from "@/lib/notify";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createTeam(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) redirect("/login?next=/teams");
  if (!(await accountActive(supabase, user.id))) return;

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const sportRaw = String(formData.get("sport_key") ?? "");
  const sport_key = SPORT_KEYS.includes(sportRaw) ? sportRaw : null;
  const city = String(formData.get("city") ?? "").trim().slice(0, 80) || null;
  const neighborhood = String(formData.get("neighborhood") ?? "").trim().slice(0, 80) || null;
  if (!name || !sport_key) return;

  const { data: team, error } = await supabase
    .from("teams")
    .insert({ name, sport_key, city, neighborhood, created_by: user.id })
    .select("id")
    .single();
  if (error || !team) return;

  // Captain membership is created via the service role (membership writes are server-side).
  const admin = createAdminClient();
  await admin.from("team_members").insert({ team_id: team.id, user_id: user.id, role: "captain" });

  redirect(`/teams/${team.id}`);
}

export async function inviteToTeam(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  const inviteeId = String(formData.get("userId"));
  if (!teamId || !inviteeId) return;

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, created_by").eq("id", teamId).maybeSingle();
  if (!team || team.created_by !== user.id) return; // only the captain invites

  const admin = createAdminClient();
  // Skip if already a member or already invited (unique constraint also guards).
  const { data: existingMember } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", inviteeId)
    .maybeSingle();
  if (existingMember) return;

  const { error } = await admin
    .from("team_invites")
    .upsert({ team_id: teamId, invited_user_id: inviteeId, invited_by: user.id, status: "pending" }, { onConflict: "team_id,invited_user_id" });
  if (error) return;

  await createNotification({
    userId: inviteeId,
    kind: "system",
    title: `You're invited to ${team.name}`,
    body: `${sportMeta(team.sport_key).name} team · respond in Teams.`,
    linkUrl: `/teams`,
  });
  revalidatePath(`/teams/${teamId}`);
}

export async function respondTeamInvite(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const inviteId = String(formData.get("inviteId"));
  const decision = String(formData.get("decision"));
  if (!inviteId || !["accept", "decline"].includes(decision)) return;

  const { data: invite } = await supabase
    .from("team_invites")
    .select("id, team_id, status, invited_user_id")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite || invite.invited_user_id !== user.id || invite.status !== "pending") return;

  if (decision === "accept") {
    const admin = createAdminClient();
    await admin.from("team_members").upsert({ team_id: invite.team_id, user_id: user.id, role: "member" }, { onConflict: "team_id,user_id" });
    await supabase.from("team_invites").update({ status: "accepted" }).eq("id", inviteId);
    // Notify the captain.
    const { data: team } = await supabase.from("teams").select("name, created_by").eq("id", invite.team_id).maybeSingle();
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    if (team?.created_by && team.created_by !== user.id) {
      await createNotification({
        userId: team.created_by,
        kind: "system",
        title: `${prof?.display_name || "A player"} joined ${team.name}`,
        body: "Your team has a new member.",
        linkUrl: `/teams/${invite.team_id}`,
      });
    }
    revalidatePath(`/teams/${invite.team_id}`);
  } else {
    await supabase.from("team_invites").update({ status: "declined" }).eq("id", inviteId);
  }
  revalidatePath("/teams");
}

export async function leaveTeam(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  if (!teamId) return;

  const { data: team } = await supabase.from("teams").select("id, created_by").eq("id", teamId).maybeSingle();
  const wasCaptain = team?.created_by === user.id;

  await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", user.id);

  if (wasCaptain) {
    const admin = createAdminClient();
    const { data: remaining } = await admin
      .from("team_members")
      .select("user_id, joined_at")
      .eq("team_id", teamId)
      .order("joined_at", { ascending: true })
      .limit(1);
    const next = remaining?.[0];
    if (next) {
      // Promote the longest-standing remaining member to captain.
      await admin.from("team_members").update({ role: "captain" }).eq("team_id", teamId).eq("user_id", next.user_id);
      await admin.from("teams").update({ created_by: next.user_id }).eq("id", teamId);
    } else {
      // Last member left — remove the empty team.
      await admin.from("teams").delete().eq("id", teamId);
      redirect("/teams");
    }
  }
  revalidatePath("/teams");
  redirect("/teams");
}

export async function removeMember(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  const memberId = String(formData.get("userId"));
  if (!teamId || !memberId || memberId === user.id) return;

  const { data: team } = await supabase.from("teams").select("created_by").eq("id", teamId).maybeSingle();
  if (!team || team.created_by !== user.id) return; // only the captain removes

  const admin = createAdminClient();
  await admin.from("team_members").delete().eq("team_id", teamId).eq("user_id", memberId);
  await admin.from("team_invites").delete().eq("team_id", teamId).eq("invited_user_id", memberId); // clear any stale invite
  revalidatePath(`/teams/${teamId}`);
}
