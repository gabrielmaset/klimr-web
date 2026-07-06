import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PymkRow, RelationshipContext } from "@/lib/social";

// Server-side graph helpers. All heavy lifting lives in SQL (indexed,
// set-based); this layer adds the lazy cache and the both-direction block set
// that visibility filtering needs (RLS only lets a user read blocks they made,
// so "who blocked me" must come through the service role).

const PYMK_TTL_MS = 24 * 60 * 60 * 1000;

type UserRpcClient = {
  rpc: (fn: "people_you_may_know", args: { p_limit: number }) => PromiseLike<{ data: PymkRow[] | null; error: unknown }>;
};

/** People You May Know, cached for a day per user and invalidated by the graph
 *  RPCs on accept/block. Compute runs on the USER's client (the definer RPC
 *  scopes itself by auth.uid(), which a service-role call doesn't carry); only
 *  the cache read/write uses the service role. */
export async function getPeopleYouMayKnow(userClient: UserRpcClient, userId: string, limit = 12): Promise<PymkRow[]> {
  const admin = createAdminClient();

  const { data: cached } = await admin.from("pymk_cache").select("payload, computed_at").eq("user_id", userId).maybeSingle();
  if (cached && Date.now() - new Date(cached.computed_at).getTime() < PYMK_TTL_MS) {
    return (cached.payload as unknown as PymkRow[]).slice(0, limit);
  }

  const { data, error } = await userClient.rpc("people_you_may_know", { p_limit: 24 });
  if (error || !data) {
    if (error) console.error("[social] pymk rpc failed", error);
    return cached ? (cached.payload as unknown as PymkRow[]).slice(0, limit) : [];
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
