---
paths:
  - "app/**"
  - "components/**"
  - "lib/**"
  - "supabase/**"
---

# Privacy, UGC, social/search, payments, and AI rules

## Privacy by design and default

- For every personal field, document purpose, sensitivity, source, consumers, legal basis/consent owner where applicable, retention, deletion/export/correction path, region/vendor, and accountable owner.
- Collect, expose, and retain only what the current feature needs. Default profiles, discovery, location precision, and relationship visibility to the least revealing state.
- Build allowlisted DTOs for each audience. Public, authenticated-self, friend/follower, organizer, moderator, support, and admin are distinct audiences.
- Never serialize full profiles or privileged queue/session state and expect the UI to hide restricted fields.
- Phone, email, date of birth, legal identity, precise/exact location, geofence centers, private relationship state, moderation evidence, payment data, internal tokens/codes, and support notes must not enter public HTML/RSC, URLs, caches, analytics, RUM, logs, errors, browser storage, or trackers without an approved necessity and control.
- Sensitive/user-specific responses use reviewed cache keys and `Cache-Control: no-store` where sharing is unsafe. Invalidate every cache/search/feed projection when visibility, block, suspension, moderation, or deletion state changes.
- Product analytics and RUM require schemas, quotas, authenticity/abuse controls, retention, and forbidden-field tests. Client-supplied telemetry is untrusted.
- Privacy helper functions do not protect data unless every read/write/RLS/search/feed/notification surface calls the policy. Arbitrary-pair helpers must not become relationship oracles.

## Klimr social, search, and discovery invariants

- Block, mute, restrict, suspension, deletion, unlisted/private visibility, membership, age/privacy rules, and moderation state must be enforced at query/policy time across search, feed, suggestions/PYMK, AI tools, tags, notifications, cache, Realtime, and direct deep links.
- Search and AI results must never reveal a person, tournament, location, relationship, or content object the caller could not retrieve directly under the same audience policy.
- A direct identifier, tag, cached item, ranked result, or AI-generated lookup is not a bypass around visibility rules.
- Report, delete, block, and moderation controls must be reachable from each supported content surface and tested end to end.
- Reports return minimal acknowledgements; do not echo snapshots/private content or reveal reporter/moderator information to unauthorized users.

## UGC and media lifecycle

- New or edited UGC uses a state machine such as draft -> quarantined -> approved/rejected. Editing approved content invalidates approval and re-enters quarantine when screened attributes change.
- Every supported media type follows the same fail-closed screening and publication policy. Scanner unavailable/timeout/error means not published.
- Upload controls include allowlisted extension, declared MIME, magic bytes/decoder, byte size, pixel dimensions, decompressed size/count, random server filename, quota, safe image rewrite/derivative, malware and policy screening, and abuse reporting.
- Pending, reported, private, and evidence objects stay in private buckets with RLS and short-lived signed access. Serve only approved derivatives publicly.
- The publish transition must verify a current screening attestation bound to the immutable object key/version, strong content digest, media type, scanner/policy version, result, and timestamp. Replacement or relevant edit invalidates the attestation. A stale, mismatched, forged, mock, no-op, or dead scanner result cannot publish in production.
- Never execute uploaded content or serve active HTML/SVG/scriptable content from the main application origin.
- Deletion uses the Storage API and a durable reconciliation job; verify both physical object and metadata lifecycle.
- Moderation actions are authorized, auditable, reason-coded, reversible where policy requires, and protected from mass assignment.
- Maintain an owner-approved illegal-content/CSAM safety policy covering detection provider, human escalation, evidence access, retention/deletion, reporting obligations, responder safety, false positives/appeals, and legal/safety review. Do not encode legal obligations from model inference.

## Payments and value

- Keep PAN/CVV outside Klimr by using a PCI-validated hosted payment flow. Never log or persist card data.
- Price, currency, recipient, entitlement, refund amount, payout, and payment state are resolved from trusted server/provider state, never the browser.
- Verify webhook signature over raw bytes and timestamp before parsing. Deduplicate event IDs, tolerate reordering, use stable idempotency keys, and reconcile with provider truth.
- Client redirects and client-reported success are not proof of payment.
- Credits, charges, refunds, entitlements, payouts, rankings, and prizes need atomic database invariants, immutable audit trails, and explicit reversal/reconciliation paths.
- Payment code, page scripts, dependencies, and CSP require qualified human review and confirmation of PCI scope; Claude cannot declare PCI compliance.
- For an embedded payment page, inventory and authorize every script, control integrity where feasible, and monitor tampering/change as required by the assessed PCI scope. Prefer a provider-hosted redirect when it satisfies product needs and document when embedded-page controls are not applicable.

## AI features and AI-generated code

- Register each AI use case with product purpose, affected users, impact, owner, vendor/model/version, input/output data classes, retention/training terms, human oversight, fallback, and decommission path.
- Treat model input and output as untrusted content. Validate and authorize tool calls and data access independently of the model response.
- Never place secrets or unnecessary private data in prompts. Define vendor use, retention, region, opt-out/consent, and deletion handling before sending personal data.
- Use fixed tool schemas, allowlists, least privilege, output validation, cost/rate limits, timeouts, and human approval for high-impact actions.
- Retrieved context must use the requesting user's current audience policy. Prompt instructions cannot override authorization.
- AI-generated recommendations must not expose hidden candidate sets or private relationship/location signals.
- Test prompt injection, data exfiltration, malformed output, excessive cost, stale permissions, unavailable provider, and unsafe tool arguments.
- Maintain representative versioned evaluations for task quality, groundedness, harmful/biased outcomes relevant to the use case, privacy leakage, security abuse, latency, and cost. Set release thresholds and investigate regressions; a provider/model/prompt/tool change is a behavior change that reruns applicable evaluations.
- Tell users when material content/action is AI-generated where product policy requires it, provide correction/appeal or human review for consequential outcomes, and keep a non-AI fallback for critical journeys when feasible.
- AI output never counts as security review, legal advice, moderation proof, or factual ground truth without the required independent control.

## Known Klimr high-risk invariants

- Public Queue/player state must not contain operator display credentials, exact geofence data, pending requests, private organizer data, or any capability that controls match state.
- A player join code must not mint or rotate an operator token. Player and operator capabilities have separate issuers, audiences, scopes, revocation, and tests.
- Queue/match finalization, waitlist offers, class enrollment/capacity, tournament roster registration, scoring, and points updates are atomic, replay-safe, and constraint-backed.
- Waitlist offer creation and notification are durably coupled; expired/reused sessions use the correct activity/lifecycle timestamp, not an unrelated creation time.
- Scheduled work isolates each item/task with durable checkpoints: one promotion/notification failure cannot skip unrelated pruning or jobs. Offer/expiry windows come from one validated product-owned configuration/spec, not a migration-local hard-coded value. Alert and reconcile offered-without-notification and other orphan states.
- Editing approved posts invalidates moderation; videos and every other published media class are screened under the same fail-closed policy.
- Suspended/unlisted/private/blocked entities stay absent from search, feed, suggestions, AI availability, Realtime, and deep-link paths.

## Required evidence

- Audience/field matrix and browser payload inspection.
- Negative cross-user, privacy-state, suspended/revoked, direct-ID, cache, and Realtime tests.
- Adversarial UGC corpus and scanner outage tests.
- End-to-end evidence that upload invokes the real production-class scanner adapter, binds the attestation to exact bytes/version/policy, permits publish only on a current valid result, and rejects tampered/stale/mismatched/no-op results.
- Payment sandbox replay/out-of-order/forgery/reconciliation tests.
- Privacy lifecycle test covering collect, access, export, correction, deletion, retention, object storage, cache/index, vendors, and backups.
