import type { Instrumentation } from "next";

/** Global server-side error capture → error_logs (Admin → Diagnostics).
 *  Next.js calls this for every uncaught error in server components, server
 *  actions, and route handlers. Must never throw. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const e = err instanceof Error ? err : new Error(String(err));
    const digest = (err as { digest?: string })?.digest;
    const admin = createAdminClient();
    // KCDX-068: `context.routePath` is already a template, but `request.path` is
    // the real URL and carries invite codes, join codes and ids; the stack carries
    // whatever was in scope. Everything persisted goes through the scrubber.
    const { scrubLogRow } = await import("@/lib/log-scrub");
    const row = scrubLogRow({
      message: `[server] ${context.routerKind} ${context.routePath || request.path}: ${e.message}`,
      detail: [digest ? `digest: ${digest}` : null, `type: ${context.routeType}`, e.stack].filter(Boolean).join("\n"),
      url: String(request.path ?? ""),
      userAgent: String(request.headers["user-agent"] ?? ""),
    });
    await admin.from("error_logs").insert({ level: "error", ...row });
  } catch {
    /* logging must never take a request down */
  }
};

/** Boot assertions (Aug 2026, audit DEP-001/DEP-002/QUEUE-002 · KCDX-004):
 *  refuse to serve a production deploy that is missing required env or running
 *  against a database behind the code.
 *
 *  This used to be gated on `process.env.VERCEL`, which meant the assertion did
 *  not exist anywhere else — a self-hosted `next start`, a preview container, a
 *  future migration off Vercel would all boot happily against a stale schema.
 *  The audit called that out and it is right: the gate belongs on the BUILD
 *  phase, not on the host. `next build` has no env in CI, so it is skipped
 *  there; every actual server start is checked. Transient DB errors only warn
 *  (availability doctrine); a confirmed stale schema is fatal. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertServerEnv } = await import("@/lib/env");
  assertServerEnv();
  const { assertSchemaCurrent } = await import("@/lib/schema-check");
  await assertSchemaCurrent();
}
