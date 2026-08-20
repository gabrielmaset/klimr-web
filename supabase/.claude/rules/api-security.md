---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "app/**/*.js"
  - "app/**/*.jsx"
  - "pages/api/**"
  - "lib/**/*.ts"
  - "lib/**/*.js"
  - "supabase/functions/**"
  - "middleware.ts"
  - "proxy.ts"
---

# API, authorization, and abuse-resistance rules

Klimr uses OWASP ASVS 5.0.0 Level 2 as the minimum verification baseline, with risk-selected Level 3 controls for privileged and highly sensitive surfaces.

## Every operation

For each Server Action, Route Handler, RPC wrapper, webhook, cron endpoint, and Realtime authorization path:

1. Define whether anonymous callers are allowed. Default deny.
2. Establish identity from a verified server session or narrowly scoped signed capability; never from a submitted user ID, role, email, username, organizer ID, or display flag.
3. Authorize the action, target object, tenant/club, lifecycle state, and writable/readable fields on every invocation.
4. Validate input with a positive schema: types, lengths, numeric ranges, enum, list count, byte size, and cross-field rules. Reject unknown fields for write DTOs.
5. Apply server-side pagination, maximum page size, resource/time bounds, and abuse controls.
6. Perform the operation atomically and define idempotency/replay behavior.
7. Return an allowlisted DTO and safe error. Never leak object existence when privacy requires indistinguishable responses.
8. Emit a privacy-safe audit/security event for privileged or high-impact actions.
9. Test anonymous, user A, user B, role/tenant boundary, suspended/revoked, invalid, stale, replayed, and concurrent calls as applicable.

Keep a CI-audited inventory of every Server Action, Route Handler, legacy API route, RPC/function, webhook, cron/job entry, Realtime publication/channel, Storage bucket/path, and Edge Function. Each entry names owner, intended callers, authentication, object/field authorization, audience projection, rate/size/time limits, and tests. An unregistered new public boundary fails review/CI.

## Prohibited authorization shortcuts

- UI visibility, middleware, page access, route naming, referrer, client-supplied claims, obscurity, UUID entropy, or possession of a join/display/invite code alone.
- A service-role client as a substitute for an authorization decision.
- Fetching a row first with elevated privilege and assuming ownership because the caller supplied its ID.
- An endpoint that validates authentication but not object-level and field-level permission.
- Broad role names where a narrow permission and resource scope is required.

## Capabilities and tokens

- Capabilities must be unguessable, purpose-bound, audience-bound, object-bound, short-lived where feasible, revocable, auditable, and stored hashed when they function like credentials.
- A public/player join code must never mint, reveal, rotate, or substitute for an operator/admin capability.
- Revocation must take effect on every path, including cached state and Realtime subscriptions.
- Never place secrets, reusable session/operator tokens, or precise private context in URLs, logs, analytics, RSC payloads, or third-party referrers. Some supported OAuth/recovery flows place a provider-issued one-time short-lived code in an HTTPS callback URL; allow only an exact redirect allowlist, no third-party scripts/analytics/referrer leakage on the callback, immediate exchange, URL scrubbing, and no logging.

## Authentication and sessions

- Use the platform's vetted authentication/session primitives; do not implement password hashing, token signing, encryption, or random-token generation ad hoc.
- Application-owned opaque session cookies are `Secure`, `HttpOnly`, narrowly scoped, and use an appropriate `SameSite` setting. Provider-managed Supabase SSR token cookies must follow the current supported SDK pattern; do not force `HttpOnly` if the browser client needs the refresh token. Require `Secure`/appropriate `SameSite`/narrow scope, PKCE, strict XSS/CSP controls, rotation, short lifetimes, revocation, and an explicit reviewed threat decision.
- Rate-limit authentication, OTP, invitation, and recovery attempts without creating a denial-of-service primitive. Responses must not disclose whether a private account exists.
- Recovery and support flows must not bypass MFA or be weaker than enrollment. Require phishing-resistant MFA/passkeys for administrators, operators, support, deployment, database, payment, and moderation accounts.
- Require recent authentication or step-up verification for credential/MFA changes, recovery, payout/payment changes, bulk export, precise location access, destructive operations, and other high-impact actions.
- Never store plaintext passwords, recovery codes, OTPs, or long-lived bearer tokens. Hash purpose-bound tokens where server-side lookup is required and compare safely.
- If Klimr controls password policy, follow NIST SP 800-63B-4: require at least 15 characters for password-only authentication (at least 8 may be allowed only when the password is one factor of MFA), permit at least 64, screen against compromised/common/context-specific values, allow paste/password managers, and do not impose composition rules or periodic rotation without compromise evidence.
- OAuth/OIDC uses exact redirect allowlists, `state`, PKCE S256, and OIDC `nonce` as applicable. Validate issuer, audience, signature, nonce, time claims, and intended client through the supported library; never trust profile/role claims beyond their defined issuer and authorization mapping.

## Web/API mechanics

- GET and HEAD are safe and side-effect free. Mutations use POST/PATCH/PUT/DELETE or Server Actions with origin/CSRF defenses.
- Credentialed CORS uses explicit origins and headers; never `*`. Keep Next.js Server Action allowed origins minimal.
- Bound body size before parsing. Bound arrays, result counts, image dimensions, decompression, processing time, and downstream spend.
- Rate limiting must protect the real shared service, not only one process. Define per-account, per-capability/device, per-IP/network, and global quotas as appropriate.
- Use generic client errors and stable machine-readable reason codes. Keep diagnostics in protected logs.
- Security headers, cookie flags, CSP nonces/hashes, frame protections, HSTS, MIME sniffing, and cache headers require automated response tests.
- Render untrusted content as text by default. Raw HTML, Markdown, SVG, CSS, or other scriptable formats require an approved sanitizer/allowlist for the exact sink. Do not add `dangerouslySetInnerHTML`, `eval`, or dynamic code execution without a reviewed design and adversarial tests.

## Outbound requests and SSRF

- Prefer no arbitrary outbound fetch. If required, allowlist exact schemes, hosts, ports, paths, and methods.
- Resolve and reject loopback, link-local, private, multicast, metadata, and disallowed address ranges for IPv4 and IPv6.
- Validate every redirect hop; limit redirects, response bytes, duration, and content type.
- Protect against DNS rebinding and TOCTOU by binding validation to the connection strategy or using an approved egress proxy.
- Do not forward caller credentials/headers to another origin. Do not return raw upstream errors or bodies.

## Webhooks, cron, and jobs

- Verify the provider signature against the raw request bytes and timestamp before parsing or mutation.
- Deduplicate immutable event IDs, tolerate duplicates and out-of-order delivery, and reconcile with the provider/source of truth.
- Authenticate cron endpoints with rotatable secrets or workload identity, enforce method, and use durable locks/idempotency.
- A 2xx response means the event is durably accepted or safely processed, not silently discarded.
- Database state plus messages/events use an outbox or an equivalent atomic durable design.

## Testing and evidence

- Do not mock authentication/RLS when testing authorization, or the network resolver when testing SSRF.
- Use a documented adversarial corpus and verify limits are global where global protection is claimed.
- Map security-sensitive changes to applicable OWASP ASVS requirement IDs and preserve evidence.
