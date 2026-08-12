import "server-only";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Privilege layer (Aug 2026 · audit ARCH-001 / KCDX-054).
 *
 *  All NEW code obtains the service-role client here — with an explicit reason
 *  and, when a human actor exists, an audit row — instead of importing
 *  `@/lib/supabase/admin` directly. ESLint (`no-restricted-imports`) enforces
 *  that for every file not on the frozen grandfather list in
 *  `eslint-admin-grandfather.mjs`. The AI-search stack stays admin-free entirely
 *  (standing rule — RLS is the security model there).
 *
 *  WHAT CHANGED AND WHY (KCDX-054). The audit row used to be written by a
 *  floating promise: `void (async () => …)()`. On a serverless platform the
 *  response returns and the invocation can be frozen or reclaimed before that
 *  promise settles, so the row landed *usually*. An audit trail that is usually
 *  written is not an audit trail — it is a log with unknown gaps, and the gaps
 *  open under load, which is exactly when it is needed.
 *
 *  `after()` is the right primitive: the runtime keeps the invocation alive
 *  until the callback finishes, so the write happens after the response without
 *  racing the shutdown. Outside a request scope (cron ticks, scripts) `after()`
 *  throws, so we fall back to awaiting inline — slower, and correct.
 *
 *  `reason` is a short machine-greppable slug ("cron:finalize-tournaments",
 *  "admin:set-verification", "system:waitlist-sweep").
 *
 *  STILL OWED, and named rather than implied: 88 files import the raw admin
 *  client directly, and a privileged mutation is still not transacted with its
 *  audit row. Transacting them means the audit lives inside the domain command —
 *  which is what 0193's tournament commands do, and what the rest should copy.
 *  `withPrivileged()` below is the interim: it cannot make the audit atomic with
 *  the state change, but it does record whether the operation finished, so a row
 *  stuck at 'started' is a detectable event rather than silence. */
export type PrivilegedContext = {
  reason: string;
  /** UUID of the human whose action this is, when one exists. */
  actorId?: string | null;
  /** Optional target for the audit row. */
  targetUserId?: string | null;
  targetRef?: string | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;

/** Run `work` after the response without racing the shutdown. `after()` throws
 *  outside a request scope, so cron ticks and scripts await inline instead. */
function durably(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    void work();
  }
}

async function writeAudit(
  client: AdminClient,
  ctx: PrivilegedContext,
  commandId: string,
  outcome: "started" | "ok" | "error" | "issued",
  detail?: string | null,
): Promise<void> {
  const { error } = await client.from("admin_actions").insert({
    actor_id: ctx.actorId ?? null,
    action: `privileged:${ctx.reason}`.slice(0, 120),
    target_user_id: ctx.targetUserId ?? null,
    target_ref: ctx.targetRef ?? null,
    command_id: commandId,
    outcome,
    detail: detail ? detail.slice(0, 500) : null,
    meta: null,
  });
  if (error) {
    // Loud, and with the command id, so a gap is investigable rather than
    // invisible. Auditing must not take the operation down; it must also not
    // fail quietly, which is what the previous empty catch did.
    console.error(
      `[privileged] AUDIT WRITE FAILED reason=${ctx.reason} command=${commandId} outcome=${outcome}: ${error.message}`,
    );
  }
}

/** The service-role client, with an audit row recorded durably.
 *
 *  Prefer `withPrivileged()` for mutations — it records whether the operation
 *  finished, which this cannot know. */
export function getPrivilegedClient(ctx: PrivilegedContext): AdminClient {
  const client = createAdminClient();
  const commandId = randomUUID();
  // KRA-017: this wrote "ok" HERE — before the operation being audited had run.
  // Every one of those rows asserted a success nobody observed, which is worse
  // than no audit row: an incident review reads them as evidence.
  //
  // "issued" (0246) is the honest state: a client was created, nothing is
  // promised about the outcome, and no partner row will arrive. It is
  // deliberately NOT "started", because "started with no partner" is the incident
  // query 0197 exists to answer, and filling it with routine handouts would bury
  // the real signal.
  durably(() => writeAudit(client, ctx, commandId, "issued"));
  return client;
}

/** Wrap a privileged operation so the audit records its OUTCOME, not merely that
 *  a client was handed out.
 *
 *  Two rows per operation: 'started' before, and 'ok' or 'error' after, sharing
 *  a command id. That is deliberately not atomic with the state change — it
 *  cannot be, from application code — and the pair is what makes the gap
 *  visible: a 'started' with no partner means the invocation died mid-operation.
 *  Querying for those is the incident question, and 0197 indexes it. */
export async function withPrivileged<T>(
  ctx: PrivilegedContext,
  work: (client: AdminClient, commandId: string) => Promise<T>,
): Promise<T> {
  const client = createAdminClient();
  const commandId = randomUUID();
  await writeAudit(client, ctx, commandId, "started");
  try {
    const result = await work(client, commandId);
    durably(() => writeAudit(client, ctx, commandId, "ok"));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    durably(() => writeAudit(client, ctx, commandId, "error", message));
    throw err;
  }
}
