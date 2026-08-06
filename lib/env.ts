/** Environment registry + production boot assertions (Aug 2026, audit DEP-002).
 *
 *  `.env.example` is generated from this list — keep them in step. Required
 *  vars fail the server LOUDLY at boot in production (instrumentation.ts)
 *  instead of degrading into a silently insecure or half-working deploy.
 *  Recommended vars only warn: each has a documented in-app degradation
 *  (Turnstile and the rate limiter fail open by recorded design; AI search
 *  and courts hide their features when unkeyed). */

export const REQUIRED_SERVER_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET", // finalize-tournaments (Vercel cron) — route fails closed without it
  "WAITLIST_CRON_SECRET", // waitlist sweep (pg_cron, 0173) — route fails closed without it
  "GATE_SECRET", // invite-gate claim signing
] as const;

export const RECOMMENDED_SERVER_ENV = [
  "RESEND_API_KEY", // transactional email (notifications.klimr.com)
  "TURNSTILE_SECRET_KEY", // CAPTCHA — documented fail-open when absent
  "ANTHROPIC_API_KEY", // AI search + courts verifier — features gate off without it
  "GOOGLE_MAPS_API_KEY", // courts live search — cached results still serve
  "NEXT_PUBLIC_SITE_URL",
] as const;

export function missingEnv(env: Record<string, string | undefined> = process.env): {
  required: string[];
  recommended: string[];
} {
  const absent = (k: string) => !env[k] || !String(env[k]).trim();
  return {
    required: REQUIRED_SERVER_ENV.filter(absent),
    recommended: RECOMMENDED_SERVER_ENV.filter(absent),
  };
}

/** Boot check — called once from instrumentation.register(). Throws in
 *  production when a required var is missing (a misconfigured deploy must not
 *  serve traffic); logs a warning in development and for recommended vars. */
export function assertServerEnv(): void {
  const { required, recommended } = missingEnv();
  if (recommended.length) {
    console.warn(`[env] recommended vars unset (features degrade as documented): ${recommended.join(", ")}`);
  }
  if (required.length) {
    const msg = `[env] REQUIRED vars missing: ${required.join(", ")} — see .env.example`;
    if (process.env.NODE_ENV === "production") throw new Error(msg);
    console.warn(msg);
  }
}
