import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Privilege layer starter (Aug 2026, audit ARCH-001 · K1-01).
 *
 *  All NEW code obtains the service-role client here — with an explicit
 *  reason and, when a human actor exists, an audit row — instead of
 *  importing `@/lib/supabase/admin` directly. ESLint (`no-restricted-imports`)
 *  enforces this for every file not on the frozen grandfather list in
 *  eslint.config.mjs; the 87 legacy files migrate opportunistically as they
 *  are touched (Phases 1–3). The AI-search stack stays admin-free entirely
 *  (standing rule — RLS is the security model there).
 *
 *  `reason` is a short machine-greppable slug ("cron:finalize-tournaments",
 *  "admin:set-verification", "system:waitlist-sweep"). */
export type PrivilegedContext = {
  reason: string;
  /** UUID of the human whose action this is, when one exists. */
  actorId?: string | null;
  /** Optional target for the audit row. */
  targetUserId?: string | null;
  targetRef?: string | null;
};

export function getPrivilegedClient(ctx: PrivilegedContext): ReturnType<typeof createAdminClient> {
  const client = createAdminClient();
  // Audit event — fire-and-forget; auditing must never block the operation.
  void (async () => {
    try {
      await client.from("admin_actions").insert({
        actor_id: ctx.actorId ?? null,
        action: `privileged:${ctx.reason}`.slice(0, 120),
        target_user_id: ctx.targetUserId ?? null,
        target_ref: ctx.targetRef ?? null,
        detail: null,
        meta: null,
      });
    } catch {
      console.error(`[privileged] audit insert failed for ${ctx.reason}`);
    }
  })();
  return client;
}
