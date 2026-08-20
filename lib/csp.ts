/** Nonce-based CSP, report-only (K3-06, audit SEC-010).
 *
 *  The enforced policy in next.config.ts still carries `'unsafe-inline'` on
 *  script-src — the pragmatic Next baseline, and the actual finding. The
 *  precondition for removing it was closing the HTML sinks, which K0-02 did
 *  (every `dangerouslySetInnerHTML` is now sanitised or escaped and inventoried
 *  in DESIGN_DECISIONS).
 *
 *  This builds the STRICTER policy and ships it as `Report-Only` alongside the
 *  enforced one. Nothing can break: violations are reported, not blocked. When
 *  the report stream is quiet for a sustained period, the same string moves
 *  into next.config.ts as the enforced policy and `'unsafe-inline'` goes.
 *
 *  `'strict-dynamic'` lets a nonce-approved script load its own dependencies,
 *  which is what makes nonce CSP workable with a bundler at all. Older browsers
 *  ignore it and fall back to the host allowlist, so the policy degrades rather
 *  than locking anyone out. */
export function buildNonceCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // No 'unsafe-inline' here — that is the entire point of this policy.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-eval'`,
    "worker-src 'self' blob:",
    "child-src blob:",
    // Style stays permissive for now: Tailwind and inline style attributes are
    // everywhere, and tightening styles is a separate, larger piece of work
    // with far lower security value than closing script injection.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://challenges.cloudflare.com",
    "frame-src https://www.openstreetmap.org https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ].join("; ");
}

/** Emergency degradation only (KFU-025). If nonce generation ever throws, the
 *  document must not ship HEADERLESS — this is the pre-enforcement baseline
 *  (inline allowed) so the page still works while the failure is investigated.
 *  Middleware logs loudly when it reaches for this. */
export function buildFallbackCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "child-src blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://challenges.cloudflare.com",
    "frame-src https://www.openstreetmap.org https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
    "object-src 'none'", "upgrade-insecure-requests", "report-uri /api/csp-report",
  ].join("; ");
}
