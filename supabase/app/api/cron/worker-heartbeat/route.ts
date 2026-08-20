import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runJobs } from "@/lib/jobs";
import { drainStorageDeletions } from "@/lib/storage-deletions";
import { runHealthWatch } from "@/lib/health-watch";
import { runVerifyVenueJob } from "@/lib/jobs-handlers";

/**
 * Worker heartbeat (H1 / KFU-002). This endpoint drives the durable background
 * work that the old /api/cron/waitlist-sweep route carried as a side effect:
 * the Storage-deletion outbox, the jobs worker (venue verification), perf-sample
 * retention, and the health canaries. It DOES NOT touch waitlists — running a
 * second waitlist engine beside the SQL sweep (0232) would create conflicting
 * promotion semantics. Waitlist unification is the full KFU-002 package.
 *
 * Each task has its own failure boundary: one throwing task must not skip the
 * others, and each returns a counted result so a silent no-op is visible. The
 * response carries per-task status; the caller (and alerting) can see which
 * component failed on any given tick.
 */
export const maxDuration = 60;

type TaskResult = { ok: boolean; error?: string; [k: string]: unknown };

async function guarded(name: string, fn: () => Promise<Record<string, unknown>>): Promise<TaskResult> {
  try {
    const r = await fn();
    return { ok: true, ...r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[worker-heartbeat] ${name} threw`, msg);
    return { ok: false, error: msg };
  }
}

export async function POST(req: Request) {
  if (!isAuthorizedCron(req.headers, process.env.WAITLIST_CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Independent failure boundaries — no task can skip another.
  const storage = await guarded("storage", () => drainStorageDeletions(100));
  const jobs = await guarded("jobs", () => runJobs("verify_venue", runVerifyVenueJob, { limit: 10, leaseSeconds: 120 }));
  const perf = await guarded("perf", async () => {
    const { getPrivilegedClient } = await import("@/lib/privileged");
    const { error } = await getPrivilegedClient({ reason: "cron:prune-perf" }).rpc("prune_perf_samples");
    if (error) throw new Error(error.message);
    return {};
  });
  const health = await guarded("health", () => runHealthWatch());

  const allOk = storage.ok && jobs.ok && perf.ok && health.ok;
  // 207 signals partial failure so an uptime monitor treats a dropped task as a
  // real event rather than a silent success — the exact failure mode KFU-002 named.
  return NextResponse.json({ ok: allOk, storage, jobs, perf, health }, { status: allOk ? 200 : 207 });
}
