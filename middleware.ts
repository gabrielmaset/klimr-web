import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildFallbackCsp, buildNonceCsp } from "@/lib/csp";

export async function middleware(request: NextRequest) {
  // K3-06: nonce-based CSP in REPORT-ONLY, next to the enforced policy from
  // next.config.ts.
  //
  // ORDER IS THE WHOLE THING (fixed Aug 2026). These headers used to be set on
  // `request` AFTER `updateSession(request)` had already returned — and
  // updateSession builds its response with
  // `NextResponse.next({ request: { headers: … } })`, which snapshots the request
  // headers at that moment. So the nonce was written to an object nobody read
  // again: Next never saw it, never put a nonce on its own <script> tags, and
  // every single chunk violated the report-only policy.
  //
  // The symptom was 190 report-only warnings reading
  // `script-src-elem blocked …/_next/static/chunks/*.js`, which looks like a
  // policy that is too strict and is actually a policy that was never delivered
  // the one thing it needs. Worse, it made the report stream useless for its
  // real purpose: we were waiting for it to go quiet before enforcing, and it
  // could never go quiet.
  //
  // Setting the nonce BEFORE updateSession means `forwarded()` copies it into
  // the downstream request, which is how Next learns it.
  // KFU-025 (2026-08-20): ENFORCED. The nonce policy ran Report-Only long
  // enough for the stream to show only extension noise (register, 08-17); the
  // plan written in lib/csp.ts is now executed. report-uri stays on the
  // enforced policy, so violations still flow to /api/csp-report.
  let csp: string;
  try {
    const nonce = btoa(crypto.randomUUID()).replace(/=+$/, "");
    csp = buildNonceCsp(nonce);
    request.headers.set("x-nonce", nonce);
  } catch (e) {
    // Never ship a document headerless: degrade to the pre-enforcement
    // baseline, loudly. If this line ever appears in logs, that is the story.
    console.error("[csp] nonce generation failed — serving fallback policy", e);
    csp = buildFallbackCsp();
  }
  request.headers.set("Content-Security-Policy", csp);

  const res = await updateSession(request);

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", request.headers.get("x-nonce") ?? "");
  return res;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
