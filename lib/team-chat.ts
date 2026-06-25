import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";

export type TeamEventKind =
  | "team_created"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "owner_transferred"
  | "role_changed"
  | "team_renamed";

/** Resolve (and, defensively, create) the conversation for a team. */
export async function teamConversationId(teamId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("conversations").select("id").eq("team_id", teamId).maybeSingle();
    if (data?.id) return data.id;
    // The team-insert trigger normally creates this; create it here as a backstop.
    const { data: t } = await admin.from("teams").select("created_by").eq("id", teamId).maybeSingle();
    const { data: created } = await admin
      .from("conversations")
      .insert({ team_id: teamId, kind: "team", created_by: t?.created_by ?? null })
      .select("id")
      .maybeSingle();
    return created?.id ?? null;
  } catch {
    return null;
  }
}

/** Append a plaintext lifecycle event to the team's chat thread. Best-effort. */
export async function logTeamEvent(
  teamId: string,
  e: { kind: TeamEventKind; actorId?: string | null; targetId?: string | null; body?: string },
) {
  try {
    const convId = await teamConversationId(teamId);
    if (!convId) return;
    const admin = createAdminClient();
    await admin.from("conversation_events").insert({
      conversation_id: convId,
      kind: e.kind,
      actor_id: e.actorId ?? null,
      target_id: e.targetId ?? null,
      body: e.body ?? null,
    });
  } catch {
    // chat events are non-critical; never block the triggering action
  }
}

/**
 * Notify a team's members (bounded by roster size) of a change. Skips `exceptId`
 * (typically the person who made the change) to avoid notifying the actor.
 */
export async function notifyTeamMembers(
  teamId: string,
  exceptId: string | null,
  n: { title: string; body?: string; linkUrl?: string },
) {
  try {
    const admin = createAdminClient();
    const { data: members } = await admin.from("team_members").select("user_id").eq("team_id", teamId);
    const targets = (members ?? []).map((m) => m.user_id).filter((id) => id !== exceptId);
    await Promise.all(
      targets.map((userId) => createNotification({ userId, kind: "system", title: n.title, body: n.body, linkUrl: n.linkUrl })),
    );
  } catch {
    // non-critical
  }
}
