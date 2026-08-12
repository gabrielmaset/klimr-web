import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { classifyPath, mayRedirectToLogin } from "@/lib/route-manifest";
import type { Database } from "@/lib/database.types";

// KCDX-039: this list used to BE the policy, and it was written for humans. Four
// machine surfaces were never added — both crons, Courtside register/heartbeat,
// CSP reports and RUM — so each received a 307 to an HTML login page instead of
// reaching a handler that already authenticated it properly. The crons never ran.
// The policy now lives in lib/route-manifest.ts, where every route has a declared
// class and adding a route means declaring what it is.

// Reachable with a session that has NOT yet cleared 2FA (AAL1). These are the
// pages a signed-in user needs *in order to* complete or recover 2FA, so the
// AAL gate must not bounce them.
const AAL_EXEMPT = ["/mfa", "/auth"];

const matches = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(p + "/"));

export async function updateSession(request: NextRequest) {
  // Forward the pathname so server components (AppShell) can tell when a request
  // is inside the team workspace. Rebuilt on each NextResponse.next so refreshed
  // auth cookies still propagate to the downstream request.
  const forwarded = () => {
    const h = new Headers(request.headers);
    h.set("x-pathname", request.nextUrl.pathname);
    return h;
  };

  let response = NextResponse.next({ request: { headers: forwarded() } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: forwarded() } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session and read the user (do not run code between these).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // The public event AD page (/e/<code>) is viewable with no account — it's the
  // event's advertisement. Its sub-routes (/e/<code>/signup, /confirm) stay
  // protected: registering requires a signed-in, 2FA-cleared account.
  const isPublicEventPage = /^\/e\/[^/]+\/?$/.test(path);

  const cls = classifyPath(path);

  // 0) Machine surfaces pass straight through. Their handlers authenticate by
  //    their own means — CRON_SECRET, a device token, or nothing at all by
  //    design — and a redirect would replace that with a login form.
  if (cls === "machine") return response;

  // 1) No session on a protected page → sign in. For an /api path that is NOT a
  //    declared machine route, fail closed with a status a caller can act on: a
  //    307 to HTML is followed silently by most clients and then parsed as data.
  if (!user && cls !== "public" && !isPublicEventPage) {
    if (!mayRedirectToLogin(path)) {
      return new NextResponse(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // 2) Signed in but two-factor not yet satisfied → complete 2FA first.
  //    Required on every protected page; marketing/auth pages are exempt.
  if (user && cls !== "public" && !matches(path, AAL_EXEMPT) && !isPublicEventPage) {
    // KRA-015: three states, and indeterminate is not allow.
    //
    // This read `if (aal?.currentLevel && …)`, so a null/absent level fell through
    // to the protected page, and the catch below did the same on any error. Both
    // were justified as avoiding a lockout on a transient failure — but the
    // failure mode chosen was "serve the protected page to someone whose
    // second factor we could not confirm".
    //
    // Unsatisfied AND indeterminate now take the SAME branch, and that branch is
    // /mfa rather than a hard 403 for navigations. That is fail-closed without a
    // lockout: a member whose session really is aal2 completes the step and
    // continues, and a transient error costs one redirect instead of admitting an
    // unverified session.
    let mfaSatisfied = false;
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      mfaSatisfied = aal?.currentLevel === "aal2";
      if (!aal?.currentLevel) {
        console.warn("[auth] AAL indeterminate — treating as unsatisfied");
      }
    } catch (e) {
      console.error("[auth] AAL lookup failed — treating as unsatisfied", e);
    }

    {
      if (!mfaSatisfied) {
        if (!mayRedirectToLogin(path)) {
          return new NextResponse(JSON.stringify({ error: "mfa_required" }), {
            status: 403,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/mfa";
        url.searchParams.set("next", path);
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
