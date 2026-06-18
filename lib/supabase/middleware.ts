import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

// Reachable without a session. Everything else redirects to /login.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/auth", "/gate"];

// Reachable with a session that has NOT yet cleared 2FA (AAL1). These are the
// pages a signed-in user needs *in order to* complete or recover 2FA, so the
// AAL gate must not bounce them.
const AAL_EXEMPT = ["/mfa", "/auth", "/create-password", "/reset-password"];

const matches = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(p + "/"));

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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

  // 1) No session on a protected page → sign in.
  if (!user && !matches(path, PUBLIC_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // 2) Signed in but two-factor not yet satisfied → complete 2FA first.
  //    Required on every protected page; marketing/auth pages are exempt.
  if (user && !matches(path, PUBLIC_PATHS) && !matches(path, AAL_EXEMPT)) {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel && aal.currentLevel !== "aal2") {
        const url = request.nextUrl.clone();
        url.pathname = "/mfa";
        url.searchParams.set("next", path);
        return NextResponse.redirect(url);
      }
    } catch {
      // Fail open for this request rather than risk locking a user out on a
      // transient error; the gate still applies on the next navigation.
    }
  }

  return response;
}
