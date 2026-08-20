import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/** App-level feed emission — the seam for anything DB triggers can't see.
 *  Mirrors lib/notify. Dedupe-keyed and idempotent like the trigger path. */
export async function publishFeedItem(input: {
  kind: string;
  actorId?: string | null;
  zip?: string | null;
  sportKey?: string | null;
  objectKind?: string | null;
  objectId?: string | null;
  meta?: Json;
  dedupeKey?: string | null;
  audience?: "region" | "global";
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("feed_items").insert({
      kind: input.kind,
      body: "",
      sport_key: input.sportKey ?? null,
      actor_id: input.actorId ?? null,
      zip: input.zip ?? null,
      object_kind: input.objectKind ?? null,
      object_id: input.objectId ?? null,
      meta: input.meta ?? {},
      dedupe_key: input.dedupeKey ?? null,
      audience: input.audience ?? "region",
    });
  } catch (e) {
    console.error("[feed] publish failed", e);
  }
}
