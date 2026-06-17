import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Kind =
  | "match_invite"
  | "match_join"
  | "match_confirm"
  | "ranking"
  | "region_challenge"
  | "marketplace"
  | "sponsorship"
  | "system";

/** Create an in-app notification for a user. Best-effort: never throws to the caller. */
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
  } catch {
    // notifications are non-critical; don't block the triggering action
  }
}
