import "server-only";
import { lookupZip } from "@/lib/us-places";
import { getPrivilegedClient } from "@/lib/privileged";

/** KRA-029 / OD-7 — records where a post came from, once, at write time.
 *
 *  Owner decision: a post's location is the location of the member who made it.
 *  Correct — but resolved HERE rather than joined at read time, because a live
 *  join to `profiles.home_zip` would make a post's presence in someone's nearby
 *  feed depend on a column members cannot read, and anyone could then move their
 *  own ZIP and binary-search another member's. Stamping once removes the probe.
 *
 *  The stored point is the ZIP CENTROID — city-level, never device GPS. It is
 *  written to `post_origins`, which no member role can read; the ranker reaches it
 *  only through `posts_within()`, which returns ids and never a coordinate. */
export async function stampPostOrigin(postId: string, authorId: string): Promise<void> {
  const admin = getPrivilegedClient({ reason: "feed:stamp-origin" });

  // Own row, and `home_zip` is not member-readable, so this goes through the
  // privileged client — the only place the ZIP is touched.
  const { data: prof } = await admin
    .from("profiles")
    .select("home_zip")
    .eq("id", authorId)
    .maybeSingle();

  const pt = prof?.home_zip ? lookupZip(prof.home_zip) : null;
  // No ZIP, or one the table does not know: the post simply has no origin and is
  // never distance-filtered IN. Failing closed here would silently hide posts
  // from members who have not set a home ZIP.
  if (!pt) return;

  const { error } = await admin
    .from("post_origins")
    .upsert({ post_id: postId, lat: pt.lat, lng: pt.lng }, { onConflict: "post_id" });
  // supabase-js does not throw; a discarded error here would leave the post
  // permanently invisible to the nearby lane with nothing recorded.
  if (error) console.error("[feed] origin stamp failed", postId, error.message);
}
