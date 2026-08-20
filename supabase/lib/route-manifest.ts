/** Route semantics (KCDX-039).
 *
 *  THE BUG. `updateSession` redirects any path outside `PUBLIC_PATHS` to
 *  `/login` — a 307 to an HTML page. That list was written for humans, and four
 *  machine surfaces were never added to it:
 *
 *    /api/cron/finalize-tournaments   scheduled in vercel.json — **never ran**
 *    /api/cron/waitlist-sweep         same
 *    /api/courtside/register          the kiosk has no session; it registers a device
 *    /api/courtside/heartbeat         same
 *    /api/csp-report                  browsers post these with no session
 *    /api/rum                         telemetry, likewise
 *
 *  Every one of them received a redirect to a login form instead of reaching its
 *  handler. The crons have therefore never executed; CSP reports and RUM have
 *  never landed; and a Courtside display could not register — which matters more
 *  now than it did, because migration 0192 makes that device token the ONLY way
 *  to record a match result. Fixing KCDX-007 without fixing this would have
 *  bricked every kiosk.
 *
 *  Worth noting the shape of the failure: each of those handlers already guards
 *  itself properly. `finalize-tournaments` checks `CRON_SECRET` and fails closed;
 *  `courtside/register` rate-limits strictly. The authorization was fine. The
 *  request simply never arrived, and a 307 to HTML looks like a working
 *  deployment to anything that does not follow redirects and parse the result.
 *
 *  THE FIX is one table. Every route has a declared class, an unlisted `/api`
 *  path fails closed rather than falling through to human handling, and nothing
 *  under `/api` is ever answered with an HTML redirect — a machine caller gets a
 *  status code it can act on.
 */

export type RouteClass =
  /** No session needed; a human may land here signed out. */
  | "public"
  /** Session required. Redirecting to /login is correct for these. */
  | "human"
  /** Session plus a second factor. */
  | "aal2"
  /** Called by a machine — cron, kiosk, browser telemetry, webhook. The handler
   *  authenticates by its own means (shared secret, device token, or nothing at
   *  all by design). Middleware must pass these through untouched and must never
   *  answer with a redirect. */
  | "machine";

type Rule = { prefix: string; cls: RouteClass; why: string };

/** Order matters: the FIRST matching prefix wins, so specific paths precede the
 *  general ones they sit under. */
export const ROUTE_MANIFEST: Rule[] = [
  // ── machine ───────────────────────────────────────────────────────────
  { prefix: "/api/cron", cls: "machine", why: "Vercel scheduler; handler verifies CRON_SECRET and fails closed." },
  { prefix: "/api/courtside", cls: "machine", why: "Venue kiosk with no human session; device token + strict rate limit." },
  { prefix: "/api/csp-report", cls: "machine", why: "Browser-generated CSP violation reports; unauthenticated by design." },
  { prefix: "/api/rum", cls: "machine", why: "Browser performance beacons; unauthenticated by design, bounded by allowlist." },
  { prefix: "/api/app-diagnostics", cls: "machine", why: "Courtside display diagnostics; throttled, content scrubbed." },
  { prefix: "/api/queue", cls: "machine", why: "Queue snapshot polling, including anonymous walk-up displays." },
  { prefix: "/api/q", cls: "machine", why: "Join-code validation for walk-up players." },

  // ── public human ──────────────────────────────────────────────────────
  { prefix: "/login", cls: "public", why: "The destination of every human redirect." },
  { prefix: "/signup", cls: "public", why: "Account creation." },
  { prefix: "/auth", cls: "public", why: "Callback and code exchange." },
  { prefix: "/gate", cls: "public", why: "Invite gate." },
  { prefix: "/q", cls: "public", why: "Walk-up queue pages, reachable from a poster." },
  { prefix: "/e", cls: "public", why: "Public event microsite." },

  // ── everything else is a human surface ────────────────────────────────
];

/** Classify a path. `/` is public; unmatched paths are human. */
export function classifyPath(pathname: string): RouteClass {
  if (pathname === "/") return "public";
  for (const r of ROUTE_MANIFEST) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.cls;
  }
  return "human";
}

/** True when a redirect to an HTML login page is a sensible answer. It never is
 *  for `/api`: a caller that asked for JSON should be told "unauthenticated",
 *  not handed a sign-in form with a 307 that most clients will follow and then
 *  report as a success. */
export function mayRedirectToLogin(pathname: string): boolean {
  return !pathname.startsWith("/api/");
}
