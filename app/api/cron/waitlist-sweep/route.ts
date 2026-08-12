import { NextResponse } from "next/server";
import { sweepWaitlists } from "@/lib/match-waitlist";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runJobs } from "@/lib/jobs";
import { drainStorageDeletions } from "@/lib/storage-deletions";
import { runHealthWatch } from "@/lib/health-watch";
import { runVerifyVenueJob } from "@/lib/jobs-handlers";

/** Pinged every minute by pg_cron (migration 0172) via pg_net. Expires
 *  overdue waitlist offers and cascades each freed spot to the next player
 *  in line, with fresh windows, notifications, and emails. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAuthorizedCron(req.headers, process.env.WAITLIST_CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await sweepWaitlists();
  // K2-03: the every-minute tick is also the jobs worker. Draining here means
  // durable work has a guaranteed heartbeat without a second cron entry —
  // whatever a dying instance dropped gets reclaimed on the next tick.
  const jobs = await runJobs("verify_venue", runVerifyVenueJob, { limit: 10, leaseSeconds: 120 });
  // Perf-sample retention (K3-05): 14 days, pruned on the same tick so there is
  // no second schedule to forget about.
  try {
    const { getPrivilegedClient } = await import("@/lib/privileged");
    await getPrivilegedClient({ reason: "cron:prune-perf" }).rpc("prune_perf_samples");
  } catch {
    /* retention is best-effort; never fail the sweep over it */
  }
  // KRA-011: drain the Storage deletion outbox on the same tick, for the reason
  // the jobs worker is already here — durable work gets a guaranteed heartbeat
  // without a second schedule to forget about. KCDX-039 found both cron routes
  // had never executed for their whole lives; a new entry is a new thing that can
  // be silently broken, an existing tick that is known to fire is not.
  let storage = { claimed: 0, deleted: 0, failed: 0 };
  try {
    storage = await drainStorageDeletions(100);
  } catch (e) {
    // Never fail the sweep over cleanup — a late deletion is survivable, a late
    // waitlist promotion is not. But say so: the whole finding was a cleanup path
    // that reported success by staying quiet.
    console.error("[storage] drain threw", e);
  }

  // KRA-040: run the canaries. `klimr_health()` existed for months and threw on
  // every call because nothing ever called it — repairing it without a caller
  // would have been the same defect one step along.
  let health = { checked: 0, failing: 0, alerted: 0 };
  try {
    health = await runHealthWatch();
  } catch (e) {
    // Never fail the sweep over monitoring; a missed waitlist promotion is worse
    // than a missed health sample. But say so, loudly.
    console.error("[health] watch threw", e);
  }

  return NextResponse.json({ ok: true, ...result, jobs, storage, health });
}
