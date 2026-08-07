import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildNonceCsp } from "@/lib/csp";

export async function middleware(request: NextRequest) {
  const res = await updateSession(request);

  // K3-06: nonce-based CSP in REPORT-ONLY, next to the enforced policy from
  // next.config.ts. Setting the nonce on the REQUEST's Content-Security-Policy
  // header is what makes Next apply it to its own inline scripts; the response
  // then carries the strict policy as Report-Only, so violations are collected
  // and nothing is blocked while we learn what would break.
  try {
    const nonce = btoa(crypto.randomUUID()).replace(/=+$/, "");
    const csp = buildNonceCsp(nonce);
    request.headers.set("x-nonce", nonce);
    request.headers.set("Content-Security-Policy", csp);
    res.headers.set("Content-Security-Policy-Report-Only", csp);
    res.headers.set("x-nonce", nonce);
  } catch {
    // A CSP failure must never cost someone their session refresh.
  }
  return res;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
