import { NextResponse } from "next/server";
import { sweepWaitlists } from "@/lib/match-waitlist";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runJobs } from "@/lib/jobs";
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
  return NextResponse.json({ ok: true, ...result, jobs });
}
