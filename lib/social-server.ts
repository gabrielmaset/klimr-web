import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PymkRow, RelationshipContext } from "@/lib/social";

// Server-side graph helpers. All heavy lifting lives in SQL (indexed,
// set-based); this layer adds the lazy cache and the both-direction block set
// that visibility filtering needs (RLS only lets a user read blocks they made,
// so "who blocked me" must come through the service role).

const PYMK_TTL_MS = 24 * 60 * 60 * 1000;

type UserRpcClient = {
  rpc: {
    (fn: "people_you_may_know", args: { p_limit: number }): PromiseLike<{ data: PymkRow[] | null; error: unknown }>;
    (fn: "pymk_valid_targets", args: { p_ids: string[] }): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

/** People You May Know, cached for a day per user and invalidated by the graph
 *  RPCs on accept/block. Compute runs on the USER's client (the definer RPC
 *  scopes itself by auth.uid(), which a service-role call doesn't carry); only
 *  the cache read/write uses the service role. */
/** The subset of these identities that may still be suggested to the caller —
 *  active, not blocked either way, not dismissed, not already related.
 *  Returns null if the check itself fails, so the caller can fall back rather
 *  than show an empty rail because of a transient error. */
async function validSuggestions(
  userClient: UserRpcClient,
  ids: string[],
): Promise<Set<string> | null> {
  if (ids.length === 0) return new Set();
  const { data, error } = await userClient.rpc("pymk_valid_targets", { p_ids: ids });
  if (error || !data) return null;
  return new Set((data as unknown as { pymk_valid_targets: string }[] | string[]).map((r) =>
    typeof r === "string" ? r : r.pymk_valid_targets,
  ));
}

export async function getPeopleYouMayKnow(userClient: UserRpcClient, userId: string, limit = 12): Promise<PymkRow[]> {
  const admin = createAdminClient();

  const { data: cached } = await admin.from("pymk_cache").select("payload, computed_at").eq("user_id", userId).maybeSingle();
  if (cached && Date.now() - new Date(cached.computed_at).getTime() < PYMK_TTL_MS) {
    // KCDX-029: a payload up to 24h old was served verbatim. In that window the
    // suggested person may have been blocked, deactivated, dismissed, or already
    // become a connection — and the rail would keep offering them with a Connect
    // button that now fails. Invalidation on accept/block was partial and always
    // will be; revalidating the identities in SQL is the guarantee, and it is one
    // indexed query against a list we already have.
    const rows = cached.payload as unknown as PymkRow[];
    const stillValid = await validSuggestions(userClient, rows.map((r) => r.user_id));
    if (stillValid) return rows.filter((r) => stillValid.has(r.user_id)).slice(0, limit);
    // KRA-027: `validSuggestions` returns null when the validation RPC itself
    // fails. Falling through to recompute is right; falling through to SERVE the
    // unvalidated payload is not, and the branch below used to do exactly that.
    console.warn("[social] pymk validation unavailable — recomputing rather than serving a stale payload");
  }

  const { data, error } = await userClient.rpc("people_you_may_know", { p_limit: 24 });
  if (error || !data) {
    if (error) console.error("[social] pymk rpc failed", error);
    // KRA-027: this returned `cached.payload` verbatim — the up-to-24h-old list,
    // with NO validation, precisely when validation was known to be unavailable.
    // The one moment the guarantee mattered was the one moment it was skipped.
    //
    // A suggestion rail is discretionary: showing nothing costs a member an empty
    // shelf, while showing a stale one can offer a Connect button for somebody who
    // has since blocked them. Empty is the correct failure.
    return [];
  }

  await admin
    .from("pymk_cache")
    .upsert({ user_id: userId, payload: data as unknown as import("@/lib/database.types").Json, computed_at: new Date().toISOString() });
  return data.slice(0, limit);
}

export type BlockSets = { iBlocked: Set<string>; blockedMe: Set<string>; all: Set<string> };

/** Both directions of the block relationship for a user — the filter every
 *  people-listing surface (search, feed, suggestions) must apply. */
export async function blockSetsFor(userId: string): Promise<BlockSets> {
  const admin = createAdminClient();
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    admin.from("blocks").select("blocked_id").eq("blocker_id", userId),
    admin.from("blocks").select("blocker_id").eq("blocked_id", userId),
  ]);
  const iBlocked = new Set((mine ?? []).map((r) => r.blocked_id));
  const blockedMe = new Set((theirs ?? []).map((r) => r.blocker_id));
  return { iBlocked, blockedMe, all: new Set([...iBlocked, ...blockedMe]) };
}

/** Relationship context between the signed-in viewer and another profile. */
export async function getRelationshipContext(
  viewerClient: { rpc: (fn: "relationship_context", args: { p_other: string }) => PromiseLike<{ data: RelationshipContext[] | null }> },
  otherId: string,
): Promise<RelationshipContext | null> {
  const { data } = await viewerClient.rpc("relationship_context", { p_other: otherId });
  return data?.[0] ?? null;
}
