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
    await admin.from("error_logs").insert({
      level: "error",
      message: `[server] ${context.routerKind} ${context.routePath || request.path}: ${e.message}`.slice(0, 1000),
      detail: [digest ? `digest: ${digest}` : null, `type: ${context.routeType}`, e.stack].filter(Boolean).join("\n").slice(0, 6000),
      url: String(request.path ?? "").slice(0, 300),
      user_agent: String(request.headers["user-agent"] ?? "").slice(0, 400) || null,
    });
  } catch {
    /* logging must never take a request down */
  }
};
