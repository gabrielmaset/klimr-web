import "server-only";
import { getPrivilegedClient } from "@/lib/privileged";
import { randomUUID } from "node:crypto";

/** Durable background jobs (K2-03, migration 0178).
 *
 *  Replaces fire-and-forget `after(() => ...)` work, which vanishes without a
 *  trace when a serverless instance is recycled. Enqueue here, and the work
 *  survives: leased exclusively, retried with backoff, dead-lettered for
 *  operator review, and replayable from /admin/jobs. */

export type JobKind = "verify_venue" | "waitlist_sweep_match" | "waitlist_expire_offer";

export type JobRow = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  correlation_id: string | null;
  created_at: string;
};

/** A correlation id ties every job spawned by one request back to it, so an
 *  operator can follow a single court search through the jobs it created. */
export function newCorrelationId(): string {
  return randomUUID();
}

export async function enqueueJob(opts: {
  kind: JobKind;
  payload?: Record<string, unknown>;
  /** Same key ⇒ same job. Use for naturally-unique work (one venue+sport). */
  dedupeKey?: string | null;
  runAfter?: Date | null;
  maxAttempts?: number;
  correlationId?: string | null;
}): Promise<string | null> {
  const admin = getPrivilegedClient({ reason: `jobs:enqueue:${opts.kind}` });
  const { data, error } = await admin.rpc("enqueue_job", {
    p_kind: opts.kind,
    p_payload: (opts.payload ?? {}) as never,
    p_dedupe_key: opts.dedupeKey ?? null,
    p_run_after: (opts.runAfter ?? new Date()).toISOString(),
    p_max_attempts: opts.maxAttempts ?? 5,
    p_correlation_id: opts.correlationId ?? null,
  });
  if (error) {
    // Enqueue failures must not break the user's request — the caller decides
    // whether to fall back to inline work.
    console.error(`[jobs] enqueue ${opts.kind} failed`, error.message);
    return null;
  }
  return (data as string) ?? null;
}

export async function claimJobs(kind: JobKind | null, limit = 10, leaseSeconds = 300): Promise<JobRow[]> {
  const admin = getPrivilegedClient({ reason: `jobs:claim:${kind ?? "any"}` });
  const owner = `${process.env.VERCEL_REGION ?? "local"}:${randomUUID().slice(0, 8)}`;
  const { data, error } = await admin.rpc("claim_jobs", {
    p_kind: kind,
    p_limit: limit,
    p_owner: owner,
    p_lease_seconds: leaseSeconds,
  });
  if (error) {
    console.error("[jobs] claim failed", error.message);
    return [];
  }
  return (data ?? []) as JobRow[];
}

export async function completeJob(id: string): Promise<void> {
  const admin = getPrivilegedClient({ reason: "jobs:complete" });
  await admin.rpc("complete_job", { p_id: id });
}

/** Records the failure and reschedules (or dead-letters). Returns the new status. */
export async function failJob(id: string, error: unknown): Promise<string | null> {
  const admin = getPrivilegedClient({ reason: "jobs:fail" });
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const { data } = await admin.rpc("fail_job", { p_id: id, p_error: msg.slice(0, 2000) });
  return (data as string) ?? null;
}

/** Runs a claimed batch through `handler`, settling each job exactly once.
 *  A handler throw is captured per job — one bad job never poisons the batch. */
export async function runJobs(
  kind: JobKind,
  handler: (job: JobRow) => Promise<void>,
  opts?: { limit?: number; leaseSeconds?: number },
): Promise<{ claimed: number; done: number; failed: number }> {
  const jobs = await claimJobs(kind, opts?.limit ?? 10, opts?.leaseSeconds ?? 300);
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await handler(job);
      await completeJob(job.id);
      done++;
    } catch (e) {
      await failJob(job.id, e);
      failed++;
    }
  }
  return { claimed: jobs.length, done, failed };
}
