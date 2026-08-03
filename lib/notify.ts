import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Kind =
  | "match_invite"
  | "friend_request"
  | "friend_accept"
  | "match_join"
  | "match_confirm"
  | "ranking"
  | "region_challenge"
  | "marketplace"
  | "sponsorship"
  | "tournament"
  | "team_invite"
  | "team_activity"
  | "system";

/** Future delivery channels attach HERE and only here (single seam):
 *  the mobile apps' push (APNs/FCM via a device-token table), web push, and
 *  email digests all take the same input. Until then this is a documented
 *  no-op, so shipping push later is one function — not a codebase sweep. */
async function deliverPush(_input: { userId: string; kind: Kind; title: string; body?: string; linkUrl?: string }): Promise<void> {
  // TODO(mobile): look up the user's registered device tokens and fan out.
  void _input;
}

/** THE notification seam. Every feature calls this — never inserts directly —
 *  so in-app rows and every future channel stay in lockstep.
 *  Best-effort: never throws to the caller.
 *
 *  PREFERENCE ENFORCEMENT: each kind maps to the user_preferences toggle that
 *  governs it (null = always deliver). "system" is deliberately unmutable —
 *  account, safety, and moderation notices bypass preferences, the industry
 *  standard. Friend requests/accepts have no toggle by design (core social
 *  graph). A missing prefs row means default-on. */
const KIND_PREF: Record<Kind, "notif_match_invites" | "notif_ranking_changes" | "notif_region_challenges" | "notif_marketplace_events" | "notif_team_invites" | "notif_team_roster" | "notif_team_activity" | null> = {
  match_invite: "notif_match_invites",
  match_join: "notif_match_invites",
  match_confirm: "notif_match_invites",
  ranking: "notif_ranking_changes",
  region_challenge: "notif_region_challenges",
  marketplace: "notif_marketplace_events",
  sponsorship: "notif_marketplace_events",
  friend_request: null,
  friend_accept: null,
  // Team life is member-controllable (Settings → Team notifications):
  // invites, roster/entry/substitution notices, and team activity.
  tournament: "notif_team_roster",
  team_invite: "notif_team_invites",
  team_activity: "notif_team_activity",
  system: null,
};
export async function createNotification(input: {
  userId: string;
  kind: Kind;
  title: string;
  body?: string;
  linkUrl?: string;
}) {
  try {
    const admin = createAdminClient();
    const prefCol = KIND_PREF[input.kind];
    if (prefCol) {
      const { data: prefs } = await admin
        .from("user_preferences")
        .select("notif_match_invites, notif_ranking_changes, notif_region_challenges, notif_marketplace_events, notif_team_invites, notif_team_roster, notif_team_activity")
        .eq("user_id", input.userId)
        .maybeSingle();
      if (prefs && prefs[prefCol] === false) return; // muted by the recipient
    }
    await admin.from("notifications").insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link_url: input.linkUrl ?? null,
    });
    void deliverPush(input);
  } catch {
    // notifications are non-critical; don't block the triggering action
  }
}
