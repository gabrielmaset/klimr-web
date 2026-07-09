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
 *  Best-effort: never throws to the caller. */
export async function createNotification(input: {
  userId: string;
  kind: Kind;
  title: string;
  body?: string;
  linkUrl?: string;
}) {
  try {
    const admin = createAdminClient();
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
