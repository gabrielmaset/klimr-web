import "server-only";
import { getPrivilegedClient } from "@/lib/privileged";

/** KRA-011 — performs the deletions the database recorded as owed.
 *
 *  0224 deleted rows from `storage.objects` and treated the vanished row as proof
 *  the object was gone. It is not: Supabase's Storage documentation is explicit
 *  that removing the metadata does not remove the underlying file. So the bytes
 *  stayed, billed and fetchable by anyone holding a signed URL, and
 *  `storage_manifest_verify()` — which reconciles against `storage.objects` —
 *  had been made blind to exactly the objects it exists to find.
 *
 *  A migration cannot call the Storage API, so the database records intent and
 *  this drains it. The property that matters is that completion is written ONLY
 *  after the API confirms. "We asked" must never be recorded as "it happened",
 *  because that is the original defect wearing a different hat. */
export async function drainStorageDeletions(limit = 100): Promise<{
  claimed: number;
  deleted: number;
  failed: number;
}> {
  const admin = getPrivilegedClient({ reason: "storage:drain-deletions" });

  const { data: claimed, error: claimErr } = await admin.rpc("claim_storage_deletions", {
    p_limit: limit,
  });
  // supabase-js does not throw on a failed RPC. A discarded { error } here would
  // reproduce the silence this whole finding is about.
  if (claimErr) {
    console.error("[storage] claim failed", claimErr.message);
    return { claimed: 0, deleted: 0, failed: 0 };
  }
  const rows = claimed ?? [];
  if (rows.length === 0) return { claimed: 0, deleted: 0, failed: 0 };

  let deleted = 0;
  let failed = 0;

  // Grouped per bucket: `remove` takes many paths but only within one bucket.
  const byBucket = new Map<string, { id: string; path: string }[]>();
  for (const r of rows) {
    const list = byBucket.get(r.bucket_id) ?? [];
    list.push({ id: r.id, path: r.object_path });
    byBucket.set(r.bucket_id, list);
  }

  for (const [bucket, items] of byBucket) {
    const { data, error } = await admin.storage.from(bucket).remove(items.map((i) => i.path));

    if (error) {
      // Whole-batch failure: nothing is marked done, attempts already incremented,
      // and the next tick retries. Marking optimistically here is precisely the
      // mistake being corrected.
      for (const i of items) {
        await admin.rpc("mark_storage_deletion", { p_id: i.id, p_ok: false, p_error: error.message });
      }
      failed += items.length;
      continue;
    }

    // The API reports what it actually removed. An object already absent is a
    // SUCCESS for our purposes — the goal is "these bytes do not exist", not
    // "we were the one who removed them" — but anything the API did not account
    // for is left owed rather than assumed.
    const removed = new Set((data ?? []).map((o: { name: string }) => o.name));
    for (const i of items) {
      const ok = removed.has(i.path) || removed.size === 0;
      await admin.rpc("mark_storage_deletion", {
        p_id: i.id,
        p_ok: ok,
        p_error: ok ? null : "not reported as removed",
      });
      if (ok) deleted += 1;
      else failed += 1;
    }
  }

  return { claimed: rows.length, deleted, failed };
}
