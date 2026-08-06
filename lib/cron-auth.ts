/** Fail-closed cron authorization (Aug 2026, audit SEC-003 / ADD-06).
 *
 *  One guard for every cron route. Accepts either transport in use today —
 *  Vercel cron sends `Authorization: Bearer <secret>`, pg_cron/pg_net sends
 *  `x-cron-secret: <secret>` (migration 0173) — and DENIES when the secret is
 *  unset. The old finalize-tournaments guard skipped auth entirely when
 *  CRON_SECRET was missing; that fail-open shape is what this replaces.
 *  Pure and framework-free so it unit-tests without a request mock. */
export function isAuthorizedCron(
  headers: { get(name: string): string | null },
  secret: string | undefined | null,
): boolean {
  if (!secret) return false; // no secret configured ⇒ nothing is authorized
  const bearer = headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  const direct = headers.get("x-cron-secret");
  return direct === secret;
}
