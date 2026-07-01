"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountActive } from "@/lib/guards";
import { createNotification } from "@/lib/notify";
import { logTeamEvent, notifyTeamMembers } from "@/lib/team-chat";
import { SPORT_KEYS, sportMeta, teamSizeFor } from "@/lib/sports";
import { withinRecoverWindow } from "@/lib/recover";
import { lookupZip } from "@/lib/us-places";
import type { TeamCard } from "./types";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The caller's role on a team, or null if they're not a member. */
async function teamRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  return data?.role ?? null;
}

const canManageRoster = (role: string | null) => role === "owner" || role === "manager";
const canInvite = (role: string | null) => role === "owner" || role === "manager" || role === "staff";

type TeamRow = { id: string; name: string; sport_key: string; city: string | null; state: string | null };

/** Add member counts + whether the viewer is already on each team. */
async function decorate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  teams: TeamRow[],
): Promise<TeamCard[]> {
  const ids = teams.map((t) => t.id);
  if (!ids.length) return [];
  const [{ data: counts }, { data: mine }] = await Promise.all([
    supabase.from("team_members").select("team_id").in("team_id", ids),
    supabase.from("team_members").select("team_id").eq("user_id", userId).in("team_id", ids),
  ]);
  const countMap = new Map<string, number>();
  for (const c of counts ?? []) countMap.set(c.team_id, (countMap.get(c.team_id) ?? 0) + 1);
  const joined = new Set((mine ?? []).map((m) => m.team_id));
  return teams.map((t) => ({ ...t, memberCount: countMap.get(t.id) ?? 0, joined: joined.has(t.id) }));
}

/**
 * Discover teams. With no query, returns teams near the viewer (their city when
 * we have one); with a query, matches name / city / neighborhood. Powers the
 * Teams discovery page. Read-only.
 */
export async function searchTeams(qRaw: string): Promise<TeamCard[]> {
  const { supabase, user } = await me();
  if (!user) return [];

  const q = (qRaw ?? "").trim().replace(/[%_\\(),"']/g, "");
  let builder = supabase.from("teams").select("id, name, sport_key, city, state");
  if (q.length >= 1) {
    const like = `%${q}%`;
    builder = builder.or(`name.ilike.${like},city.ilike.${like},state.ilike.${like}`);
  } else {
    const { data: prof } = await supabase.from("profiles").select("city").eq("id", user.id).maybeSingle();
    if (prof?.city) builder = builder.ilike("city", prof.city);
  }

  const { data: teams } = await builder.order("created_at", { ascending: false }).limit(24);
  const cards = await decorate(supabase, user.id, (teams ?? []) as TeamRow[]);
  cards.sort((a, b) => b.memberCount - a.memberCount); // busiest first
  return cards;
}

export type TeamFormState = { ok?: boolean; error?: string } | undefined;

/** Live ZIP -> city/state for the create & edit forms (offline lookup, no network). */
export async function resolveTeamZip(zip: string): Promise<{ city: string; state: string } | null> {
  const hit = lookupZip(String(zip ?? ""));
  return hit ? { city: hit.city, state: hit.state } : null;
}


export async function createTeam(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const { supabase, user } = await me();
  if (!user) redirect("/login?next=/teams");
  if (!(await accountActive(supabase, user.id))) return { error: "Your account isn't active yet." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const sportRaw = String(formData.get("sport_key") ?? "");
  const sport_key = SPORT_KEYS.includes(sportRaw) ? sportRaw : null;
  const category = String(formData.get("category") ?? "recreational") === "pro" ? "pro" : "recreational";
  if (!name) return { error: "Give your team a name." };
  if (!sport_key) return { error: "Pick a sport." };

  // Squad size: the chosen cap, clamped to the sport's allowed range (min is 2).
  const sz = teamSizeFor(sport_key);
  const rawSize = parseInt(String(formData.get("max_size") ?? ""), 10);
  const max_size = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, sz.min), sz.max) : sz.default;

  // Location is captured as a ZIP; we resolve city/state from it server-side.
  const hit = lookupZip(String(formData.get("zip") ?? ""));
  if (!hit) return { error: "Enter a valid 5-digit US ZIP for your team's home area." };

  const { data: team, error } = await supabase
    .from("teams")
    .insert({ name, sport_key, zip: hit.zip, city: hit.city, state: hit.state, max_size, category, created_by: user.id })
    .select("id")
    .single();
  if (error || !team) {
    console.error("[teams] create failed", error?.code, error?.message);
    return { error: `Couldn't create the team${error?.code ? ` (${error.code})` : ""}. Please try again.` };
  }

  // Owner membership is created via the service role (membership writes are server-side).
  const admin = createAdminClient();
  const { error: mErr } = await admin.from("team_members").insert({ team_id: team.id, user_id: user.id, role: "owner" });
  if (mErr) console.error("[teams] owner membership failed", mErr.code, mErr.message);

  // The conversation is created by a DB trigger on team insert; record the first event.
  await logTeamEvent(team.id, { kind: "team_created", actorId: user.id, body: name });

  revalidatePath("/teams");
  // Pro teams get the full workspace; recreational teams use the basic team page.
  redirect(category === "pro" ? `/team/${team.id}` : `/teams/${team.id}`);
}

/** Captain edits the team's name and location (sport stays fixed). */
export async function updateTeam(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in." };
  const teamId = String(formData.get("teamId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!teamId) return { error: "Missing team." };
  if (!name) return { error: "Give your team a name." };

  if (!canManageRoster(await teamRole(supabase, teamId, user.id))) return { error: "Only the owner or a manager can edit the team." };

  const hit = lookupZip(String(formData.get("zip") ?? ""));
  if (!hit) return { error: "Enter a valid 5-digit US ZIP." };

  // Squad size: clamp to the sport range, but never below the current roster.
  const { data: t } = await supabase.from("teams").select("sport_key, name").eq("id", teamId).maybeSingle();
  const renamed = (t?.name ?? "") !== name;
  const sz = teamSizeFor(t?.sport_key ?? "");
  const { count: mc } = await supabase.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", teamId);
  const floor = Math.max(sz.min, mc ?? sz.min);
  const rawSize = parseInt(String(formData.get("max_size") ?? ""), 10);
  const patch: { name: string; zip: string; city: string; state: string; max_size?: number } = { name, zip: hit.zip, city: hit.city, state: hit.state };
  if (Number.isFinite(rawSize)) patch.max_size = Math.min(Math.max(rawSize, floor), sz.max);

  const { error } = await supabase.from("teams").update(patch).eq("id", teamId);
  if (error) {
    console.error("[teams] update failed", error.code, error.message);
    return { error: `Couldn't save${error.code ? ` (${error.code})` : ""}.` };
  }
  if (renamed) {
    await logTeamEvent(teamId, { kind: "team_renamed", actorId: user.id, body: name });
    await notifyTeamMembers(teamId, user.id, { title: `Team renamed to ${name}`, linkUrl: `/teams/${teamId}` });
  }
  revalidatePath(`/teams/${teamId}`);
  return { ok: true };
}

/** Captain-only search for FRIENDS to invite (by name), excluding current
 *  members, the captain, and anyone already invited. Only accepted friends are
 *  eligible — you must be connected before you can add someone to a team. */
export async function searchTeamCandidates(
  teamId: string,
  query: string,
): Promise<{ id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null }[]> {
  const { supabase, user } = await me();
  if (!user) return [];
  const q = query.replace(/[%,()]/g, "").trim();
  if (q.length < 2) return [];

  if (!canInvite(await teamRole(supabase, teamId, user.id))) return [];

  const [{ data: members }, { data: invited }, { data: fr }] = await Promise.all([
    supabase.from("team_members").select("user_id").eq("team_id", teamId),
    supabase.from("team_invites").select("invited_user_id").eq("team_id", teamId).eq("status", "pending"),
    supabase.from("friendships").select("requester_id, addressee_id").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted"),
  ]);
  const exclude = new Set<string>([user.id]);
  for (const m of members ?? []) exclude.add(m.user_id);
  for (const i of invited ?? []) exclude.add(i.invited_user_id);
  const friendIds = (fr ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id)).filter((id) => !exclude.has(id));
  if (friendIds.length === 0) return [];

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_hue, avatar_path, city, account_status")
    .in("id", friendIds)
    .ilike("display_name", `%${q}%`)
    .limit(20);

  return ((profs ?? []) as { id: string; display_name: string; avatar_hue: number; avatar_path: string | null; city: string | null; account_status: string }[])
    .filter((p) => p.account_status === "active")
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      display_name: p.display_name,
      avatar_hue: p.avatar_hue,
      avatar_url: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
      city: p.city,
    }));
}

export async function inviteToTeam(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  const inviteeId = String(formData.get("userId"));
  if (!teamId || !inviteeId) return;

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, created_by, max_size").eq("id", teamId).maybeSingle();
  if (!team) return;
  if (!canInvite(await teamRole(supabase, teamId, user.id))) return; // owner / manager / staff invite

  // You can only invite players you're friends with.
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${inviteeId}),and(requester_id.eq.${inviteeId},addressee_id.eq.${user.id})`)
    .eq("status", "accepted")
    .maybeSingle();
  if (!friendship) return;

  const admin = createAdminClient();
  // Skip if already a member or already invited (unique constraint also guards).
  const { data: existingMember } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", inviteeId)
    .maybeSingle();
  if (existingMember) return;

  // Respect the squad-size cap (confirmed members + outstanding invites).
  {
    const sz = teamSizeFor(team.sport_key);
    const cap = team.max_size ?? sz.max;
    const [{ count: mc }, { count: pc }] = await Promise.all([
      admin.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", teamId),
      admin.from("team_invites").select("invited_user_id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "pending"),
    ]);
    if ((mc ?? 0) + (pc ?? 0) >= cap) return;
  }

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
    const { data: team } = await supabase.from("teams").select("name, created_by, sport_key, max_size").eq("id", invite.team_id).maybeSingle();
    // Enforce the squad-size cap at accept time (backstop against races / over-invites).
    if (team) {
      const sz = teamSizeFor(team.sport_key);
      const cap = team.max_size ?? sz.max;
      const { count: mc } = await admin.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", invite.team_id);
      if ((mc ?? 0) >= cap) {
        revalidatePath("/teams");
        return;
      }
    }
    await admin.from("team_members").upsert({ team_id: invite.team_id, user_id: user.id, role: "member" }, { onConflict: "team_id,user_id" });
    await supabase.from("team_invites").update({ status: "accepted" }).eq("id", inviteId);
    // Log the join in the team thread and notify the rest of the roster.
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const who = prof?.display_name || "A player";
    await logTeamEvent(invite.team_id, { kind: "member_joined", actorId: user.id, targetId: user.id, body: who });
    await notifyTeamMembers(invite.team_id, user.id, {
      title: `${who} joined ${team?.name ?? "your team"}`,
      body: "Your team has a new member.",
      linkUrl: `/teams/${invite.team_id}`,
    });
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

  const { data: team } = await supabase.from("teams").select("id, name, created_by").eq("id", teamId).maybeSingle();
  const wasOwner = team?.created_by === user.id;
  const { data: meProf } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const myName = meProf?.display_name || "A player";
  const teamName = team?.name ?? "your team";

  await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", user.id);

  if (wasOwner) {
    const admin = createAdminClient();
    const { data: remaining } = await admin
      .from("team_members")
      .select("user_id, joined_at")
      .eq("team_id", teamId)
      .order("joined_at", { ascending: true })
      .limit(1);
    const next = remaining?.[0];
    if (next) {
      // Promote the longest-standing remaining member to owner.
      await admin.from("team_members").update({ role: "owner" }).eq("team_id", teamId).eq("user_id", next.user_id);
      await admin.from("teams").update({ created_by: next.user_id }).eq("id", teamId);
      await logTeamEvent(teamId, { kind: "member_left", actorId: user.id, body: myName });
      await logTeamEvent(teamId, { kind: "owner_transferred", actorId: user.id, targetId: next.user_id });
      await notifyTeamMembers(teamId, user.id, { title: `${myName} left ${teamName}`, linkUrl: `/teams/${teamId}` });
      await createNotification({
        userId: next.user_id,
        kind: "system",
        title: `You're now the owner of ${teamName}`,
        body: "The previous owner left, so ownership passed to you.",
        linkUrl: `/teams/${teamId}`,
      });
    } else {
      // Last member left — remove the empty team (its conversation cascades away).
      await admin.from("teams").delete().eq("id", teamId);
      redirect("/teams");
    }
  } else {
    await logTeamEvent(teamId, { kind: "member_left", actorId: user.id, body: myName });
    await notifyTeamMembers(teamId, user.id, { title: `${myName} left ${teamName}`, linkUrl: `/teams/${teamId}` });
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

  const [actorRole, { data: targetRow }] = await Promise.all([
    teamRole(supabase, teamId, user.id),
    supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", memberId).maybeSingle(),
  ]);
  if (!canManageRoster(actorRole)) return; // owner / manager remove
  const targetRole = targetRow?.role ?? "member";
  if (targetRole === "owner") return; // the owner can't be removed (transfer first)
  if (actorRole === "manager" && targetRole === "manager") return; // a manager can't remove a peer manager

  const admin = createAdminClient();
  await admin.from("team_members").delete().eq("team_id", teamId).eq("user_id", memberId);
  await admin.from("team_invites").delete().eq("team_id", teamId).eq("invited_user_id", memberId); // clear any stale invite
  const { data: tn } = await admin.from("teams").select("name").eq("id", teamId).maybeSingle();
  await logTeamEvent(teamId, { kind: "member_removed", actorId: user.id, targetId: memberId });
  await createNotification({
    userId: memberId,
    kind: "system",
    title: `You were removed from ${tn?.name ?? "a team"}`,
    body: "An owner or manager removed you from the team.",
    linkUrl: "/teams",
  });
  revalidatePath(`/teams/${teamId}`);
}

/** Owner assigns an admin role (manager / staff / member) to a member. */
export async function setMemberRole(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  const memberId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (!teamId || !memberId || memberId === user.id) return;
  if (!["manager", "staff", "member"].includes(role)) return; // owner is set via transfer only
  if ((await teamRole(supabase, teamId, user.id)) !== "owner") return;

  const admin = createAdminClient();
  // Manager/staff roles exist only for Pro teams; recreational teams are owner + members.
  const { data: team } = await admin.from("teams").select("category, name").eq("id", teamId).maybeSingle();
  if (team?.category !== "pro") return;
  await admin.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", memberId).neq("role", "owner");
  const roleLabel = role === "manager" ? "Manager" : role === "staff" ? "Staff" : "Member";
  await logTeamEvent(teamId, { kind: "role_changed", actorId: user.id, targetId: memberId, body: roleLabel });
  await createNotification({
    userId: memberId,
    kind: "system",
    title: `Your role in ${team?.name ?? "your team"} is now ${roleLabel}`,
    linkUrl: `/teams/${teamId}`,
  });
  revalidatePath(`/teams/${teamId}`);
}

/** Owner or manager sets a player's on-court designation (captain / co-captain / sub). */
export async function setMemberDesignation(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  const memberId = String(formData.get("userId"));
  const raw = String(formData.get("designation"));
  const designation = ["captain", "co_captain", "sub"].includes(raw) ? raw : null;
  if (!teamId || !memberId) return;
  if (!canManageRoster(await teamRole(supabase, teamId, user.id))) return;

  const admin = createAdminClient();
  await admin.from("team_members").update({ designation }).eq("team_id", teamId).eq("user_id", memberId);
  revalidatePath(`/teams/${teamId}`);
}

/** Owner hands ownership to another member; the old owner becomes a manager. */
export async function transferOwnership(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const teamId = String(formData.get("teamId"));
  const memberId = String(formData.get("userId"));
  if (!teamId || !memberId || memberId === user.id) return;
  if ((await teamRole(supabase, teamId, user.id)) !== "owner") return;

  const admin = createAdminClient();
  // Target must already be a member.
  const { data: target } = await admin.from("team_members").select("user_id").eq("team_id", teamId).eq("user_id", memberId).maybeSingle();
  if (!target) return;
  await admin.from("team_members").update({ role: "owner" }).eq("team_id", teamId).eq("user_id", memberId);
  await admin.from("team_members").update({ role: "manager" }).eq("team_id", teamId).eq("user_id", user.id);
  await admin.from("teams").update({ created_by: memberId }).eq("id", teamId);

  await createNotification({
    userId: memberId,
    kind: "system",
    title: "You're now a team owner",
    body: "Ownership of your team was transferred to you.",
    linkUrl: `/teams/${teamId}`,
  });
  await logTeamEvent(teamId, { kind: "owner_transferred", actorId: user.id, targetId: memberId });
  revalidatePath(`/teams/${teamId}`);
}

/** Soft-disband a team (owner only). Keeps roster, chat, and match history; recoverable for 90 days. */
export async function disbandTeam(teamId: string): Promise<{ error?: string } | void> {
  if (!teamId) return { error: "Missing team." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: me } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
  if (!me || me.role !== "owner") return { error: "Only the team owner can disband this team." };
  await supabase.from("teams").update({ deleted_at: new Date().toISOString() }).eq("id", teamId);
  revalidatePath(`/team/${teamId}`);
  revalidatePath("/teams");
}

/** Restore a disbanded team within the 90-day window. Void form action. */
export async function restoreTeam(formData: FormData): Promise<void> {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: me } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
  if (!me || me.role !== "owner") return;
  const { data: t } = await supabase.from("teams").select("deleted_at").eq("id", teamId).maybeSingle();
  if (!t || !t.deleted_at || !withinRecoverWindow(t.deleted_at)) return;
  await supabase.from("teams").update({ deleted_at: null }).eq("id", teamId);
  revalidatePath(`/team/${teamId}`);
  revalidatePath("/teams");
}
