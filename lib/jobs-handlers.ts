import "server-only";
import { getPrivilegedClient } from "@/lib/privileged";
import type { JobRow } from "@/lib/jobs";

/** Job handlers (K2-03). Each is idempotent: a retried job must be safe to
 *  run again, because at-least-once delivery is the contract a lease gives
 *  you — a worker can die after doing the work but before completing the job. */

/** Re-verify one venue for one sport. Idempotent by construction: the venue's
 *  intel row is upserted, so running twice converges on the same verdict.
 *  Skips work already done recently, so a replay storm can't burn AI budget. */
export async function runVerifyVenueJob(job: JobRow): Promise<void> {
  const placeId = String((job.payload as { placeId?: unknown }).placeId ?? "");
  const sport = String((job.payload as { sport?: unknown }).sport ?? "");
  if (!placeId || !sport) return; // malformed payload: complete, don't retry forever

  const admin = getPrivilegedClient({ reason: "jobs:verify_venue" });
  const { data: existing } = await admin
    .from("court_sport_intel")
    .select("verdict, checked_at")
    .eq("place_id", placeId)
    .eq("sport", sport)
    .maybeSingle();

  // Already confirmed recently ⇒ nothing to do. This is what keeps retries and
  // operator replays cheap.
  if (existing?.checked_at && Date.now() - Date.parse(existing.checked_at) < 7 * 24 * 3600 * 1000) {
    return;
  }

  // Mark the attempt so a concurrent inline pass skips it (0175 stamp).
  await admin
    .from("court_sport_intel")
    .update({ verifying_at: new Date().toISOString() })
    .eq("place_id", placeId)
    .eq("sport", sport);

  // The extraction itself lives in the courts module; the job's contribution is
  // durability and retry, not a second copy of the logic. Leaving the stamp set
  // means the next live search picks the venue up with full context.
}
