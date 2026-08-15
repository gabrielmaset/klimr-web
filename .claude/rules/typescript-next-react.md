---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "next.config.*"
  - "tsconfig*.json"
  - "eslint.config.*"
---

# TypeScript, React, and Next.js rules

## Type safety

- Keep TypeScript `strict` enabled. New code must also behave safely under `noUncheckedIndexedAccess`; enable it project-wide after backlog review.
- Treat all decoded JSON, form data, URL/search params, headers, cookies, environment variables, database JSON, webhooks, and third-party results as `unknown` until validated.
- Prefer discriminated unions, exhaustive checks, branded identifiers, and narrow domain types over booleans and loose string bags.
- Do not add `any`, double casts such as `as unknown as T`, unjustified type assertions, non-null assertions, `@ts-ignore`, or `@ts-nocheck`. A narrowly documented exception needs owner, reason, and expiry.
- Never use a type assertion as validation. Runtime validation must prove type, bounds, cardinality, format, and cross-field business meaning.
- Handle every Promise. Await it, return it, or explicitly attach error handling. `void promise` is allowed only for an intentionally detached, observable, idempotent operation with documented ownership.
- Model expected failures with typed results or specific errors. Do not catch `unknown` and silently continue.

## Next.js trust boundaries

- Treat every exported Server Action and every Route Handler as a public API callable without its UI.
- Authenticate, authorize the exact actor/action/object/fields, validate input, rate-limit where appropriate, and return a minimal response inside each public operation or a server-only data-access layer it calls.
- Add `import 'server-only'` to privileged DAL, service-role, secret, payment, moderation, and private-data modules.
- Client Components are browser code. Never import secrets or privileged clients into them, and never pass sensitive values through props merely because the component source is marked server-side.
- Build explicit public/private/admin DTOs field by field. Do not return raw ORM/Supabase rows or use `select('*')` across a trust boundary.
- Inspect HTML, RSC/Flight payloads, network responses, caches, logs, and source maps for sensitive data. React taint APIs are defense in depth, not authorization or projection.
- GET, HEAD, metadata generation, layouts, rendering, and data fetching must not mutate durable state.
- Do not rely on middleware, layouts, hidden controls, route groups, page redirects, or prior navigation as authorization.
- Set explicit cache behavior for sensitive/user-specific data. Use `no-store` where shared caching could disclose data; include every audience-affecting attribute in a reviewed cache key.
- Validate redirects and callback URLs against an allowlist; do not accept arbitrary schemes, hosts, or protocol-relative URLs.

## React correctness

- Components and Hooks must be pure and idempotent during render. No database writes, analytics writes, timers, random IDs, or other side effects in render.
- Treat props, state, and Hook values as immutable snapshots. Use state setters and immutable updates.
- Follow Rules of Hooks; do not hide Hook calls behind conditionals, callbacks, or exception handling.
- Effects synchronize with external systems. Do not use an Effect for derivable values or to copy props to state without a documented reason.
- Clean up subscriptions, timers, observers, and in-flight work. Account for React Strict Mode development re-execution.
- Use stable, domain-derived keys. Never use an array index where items can reorder, insert, or delete.
- Render explicit loading, empty, permission-denied, error, stale, and retry states. A swallowed error plus empty UI is not graceful degradation.
- Use framework image/font/script primitives deliberately; document exceptions that affect security, accessibility, or Core Web Vitals.

## Module design

- Prefer Server Components by default; add `'use client'` only at the smallest interactive boundary.
- Keep domain logic independent of React and transport layers so it can be tested without rendering.
- One canonical implementation owns each authorization rule, projection, state transition, and idempotency decision.
- Use explicit dependency injection for clocks, random values, network clients, and queues when deterministic testing is necessary.
- Do not add generic wrappers that erase useful types or errors. Abstractions must reduce duplication of a stable concept, not conceal complexity.

## Domain correctness

- Represent a point in time as an explicit UTC instant and a calendar event with its named IANA time zone. Never depend on a developer/server/browser default zone. Test daylight-saving gaps/overlaps, midnight boundaries, expiry, and clock skew.
- Use an exact decimal or integer minor-unit representation for money/value and always carry currency. Never calculate monetary amounts with an unqualified JavaScript floating-point `number`.
- Do not coerce 64-bit database identifiers or counters into an unsafe JavaScript number. Validate safe ranges or retain a string/BigInt representation at the correct boundary.
- Define canonical normalization for case-insensitive identifiers, email, usernames, phone numbers, and Unicode. Preserve the display form separately when needed; do not invent locale-sensitive equality.
- Pagination has a deterministic total order with a unique tie-breaker. Under changing data, prefer a validated cursor over unbounded offset pagination.
- Version durable/public contracts. Prefer additive compatible changes; reject ambiguous unknown write fields and provide a staged deprecation path for breaking changes.

## Required tests

- Unit-test domain edge cases and exhaustive transitions.
- Directly invoke Server Actions/Route Handlers with unauthorized, cross-user, malformed, oversized, duplicate, and stale inputs.
- Test RSC/client serialization for forbidden fields.
- Test production builds and browser behavior; development mode is not sufficient evidence.
- Test time-zone/DST, monetary rounding, Unicode/normalization, ordering ties, and cursor behavior whenever those domains are affected.
