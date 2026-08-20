# Klimr enterprise engineering standard

Version: 1.0  
Research snapshot: 2026-08-10  
Applies to: humans and coding agents changing Klimr's Next.js, React, TypeScript, Node.js, Supabase, PostgreSQL, Storage, Realtime, jobs, integrations, and delivery system

## Purpose

This standard converts widely used professional guidance into concrete Klimr policy. Its goals are to reduce preventable defects, make unsafe shortcuts merge-blocking, require evidence proportional to risk, and give Klimr a credible path toward large-scale operation.

It does not guarantee defect-free software, millions-user capacity, legal compliance, PCI compliance, or security certification. Those claims require scoped independent assessment and production-like evidence.

## Normative interpretation

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** follow [BCP 14](https://www.rfc-editor.org/rfc/rfc8174.html) when capitalized.

- MUST/MUST NOT: merge or release blocker unless the accountable project risk owner approves a time-limited written exception with compensating controls; R2/R3 also requires a non-author qualified specialty approver. No exception can waive law, contract, or provider requirements.
- SHOULD/SHOULD NOT: default. Deviation requires a written technical reason, risk, owner, and review date.
- MAY: optional.

External sources do not individually mandate every Klimr implementation choice below. This document combines their principles with stricter project-specific risk decisions. Where law, contract, platform policy, or an approved specification is stricter, the stricter requirement wins.

## Baselines

1. [NIST SP 800-218 SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) is the secure development lifecycle baseline: prepare, protect, produce well-secured software, and respond to vulnerabilities.
2. [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) Level 2 is the minimum application-security verification target.
3. Relevant ASVS Level 3 controls apply to administrators, support/moderation, Courtside operators, identity recovery, payment/value, exact location, private identity, evidence, bulk export, cryptographic controls, and destructive operations.
4. [OWASP SAMM](https://owasp.org/www-project-samm/) guides security maturity across governance, design, implementation, verification, and operations.
5. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA is the accessibility target for complete supported journeys. Klimr additionally targets 44-by-44 CSS-pixel primary touch controls.
6. [SLSA 1.2](https://slsa.dev/spec/v1.2/) Build Level 2 is the immediate build-provenance target; Build Level 3 is required before large-scale public launch.
7. User-centered SLOs, error budgets, production-like load evidence, staged delivery, and restore evidence are required for public-GO claims.

## Governance and accountability

- Product ownership defines who may do what, which data each audience may see, lifecycle/retention, and acceptable failure behavior. Claude must not invent these decisions.
- Engineers and Claude implement the smallest coherent change, produce evidence, and disclose residual risk.
- A non-author human reviews every production change. Qualified security/database/privacy/payments/accessibility/reliability review is mandatory for the matching high-risk surface.
- CI independently enforces types, lint, tests, build, security/supply-chain, and database gates. Claude cannot waive them.
- Production deployment uses limited identities, immutable reviewed artifacts, staged rollout, telemetry, halt criteria, and rollback/forward-repair ownership.
- Incidents and high-impact defects receive root-cause/variant analysis and a recurrence-prevention control, not only a local patch.

## Risk and proof model

| Tier | Examples | Minimum proof before merge | Additional proof before deploy/GO |
|---|---|---|---|
| R0 | Documentation or style with no behavior | Review, link/format check, scoped diff | None beyond normal release |
| R1 | Isolated ordinary behavior | Regression/unit tests, strict types, lint ratchet, build as relevant, human review | Preview smoke and normal staged release |
| R2 | Auth/RLS, PII/location, service role, migration, payments/value, capacity, Queue/Courtside, UGC/moderation, cache visibility, cron/jobs, concurrency | Written threat/failure model, direct negative tests, real-boundary integration, independent specialty review, full applicable CI | Production-like preview/staging, migration/replay/concurrency/fault evidence, observability and rollback |
| R3 | Production/destructive action, recovery/MFA, secret/key operation, backup restore, irreversible transformation | Explicit owner authorization, rehearsal, two-person review, containment/recovery plan | Controlled execution, live monitoring, verified identity/build/schema, post-action integrity evidence |

Evidence labels are fixed:

- **Static:** source/config inspected only.
- **Executed-local:** run locally against named dependencies and identities.
- **Recorded:** another party's evidence, not independently rerun.
- **Staging:** run in an isolated production-like environment.
- **Production:** observed on the exact deployed build/schema/config with timestamp.

`Fixed`, `secure`, `production-ready`, and `GO` require the acceptance tests at the required level and closure of bypass paths. Otherwise use precise terms such as partial, contained, blocked, not reproduced, or production-unverified.

## Non-negotiable engineering principles

### 1. Understand the system before changing it

- Trace all callers and alternate interfaces through UI, RSC, Server Actions, routes, RPC, PostgREST, Realtime, Storage, jobs, caches, and service-role paths.
- Define actors, assets, trust boundaries, state machine, invariants, concurrency, retries, partial failures, side effects, and rollback.
- Reproduce the defect or write a failing regression. Search repository-wide for the root-cause pattern.
- Keep changes small and coherent; do not mix unrelated refactors or speculative architecture.

### 2. Treat every boundary as hostile

- Browser and mobile clients, request fields, URLs, cookies, headers, uploads, webhooks, database JSON, third-party responses, telemetry, and model output are untrusted.
- Validate at the trusted server layer with positive schemas and bounded sizes/counts/ranges.
- Parameterize SQL and never concatenate untrusted shell, path, header, redirect, template, or outbound URL values.
- Every exported Server Action and Route Handler is a public endpoint and must authorize independently.

### 3. Authorization is deny-by-default and object-specific

- Authenticate the caller from verified server state.
- Authorize the action, target record, tenant/club, lifecycle state, and individual fields on every request.
- UI hiding, middleware, a UUID/code, prior navigation, client claims, or service-role execution is never authorization.
- Test anonymous, user A, user B, cross-tenant, privileged, suspended/revoked, blocked/muted/restricted, stale, direct-ID, and replay paths as applicable.

### 4. Minimize and project data

- Maintain audience-specific DTOs; never serialize raw rows or privileged state to the browser.
- Collect, expose, log, cache, analyze, and retain only necessary personal data with purpose and lifecycle.
- Search/feed/suggestions/AI/caches/Realtime/direct links enforce the same current visibility and relationship policy as direct access.
- Sensitive data stays out of URLs, RSC payloads, public caches, logs, metrics labels, analytics, errors, and client storage unless explicitly justified and protected.

### 5. Put durable invariants in PostgreSQL

- Use constraints and atomic transitions for uniqueness, capacity, money/value, scoring, Queue, waitlists, enrollment, rosters, and finalization.
- Avoid check-then-write races. Use locks or Serializable isolation where required and retry the whole transaction on serialization/deadlock failure.
- External side effects do not occur inside retryable transactions. Use a durable outbox and idempotent consumers.
- Test contested behavior with synchronized clients against real PostgreSQL.

### 6. Apply least privilege at Supabase/PostgreSQL

- Exposed tables enable RLS when created and use explicit role/operation policies with `USING` and `WITH CHECK`.
- Test using real low-privilege roles; service-role/owner success does not prove RLS.
- Prefer `SECURITY INVOKER`. Privileged functions live privately, fix `search_path`, authorize internally, revoke default `PUBLIC EXECUTE` in the same transaction, and grant named roles only.
- Audit default ACLs and NULL ACL representations, overloaded functions, views, publications, Storage, and remote drift.

### 7. Make failure bounded and truthful

- Every external operation has a deadline/cancellation strategy.
- Retry only transient, idempotent work with jitter, limits, and one retry-owning layer.
- Handle duplicate, delayed, out-of-order, overlapping, skipped, and partially completed jobs/events.
- Fail closed for authorization, privacy, integrity, payment, moderation, and safety dependencies.
- Never swallow an error, discard a result, return success before durable ownership, or disguise failure as empty state.

### 8. Secure UGC, payments, and AI by lifecycle

- All UGC/media enters private quarantine and publishes only after required fail-closed checks. Editing approved content invalidates approval when screened attributes change.
- Delete object bytes via the Storage API and reconcile metadata/object state.
- Keep PAN/CVV outside Klimr using a PCI-validated hosted flow; server/provider truth owns price and state; signed webhooks are deduplicated, idempotent, and reconciled.
- AI input/output and tool calls are untrusted. Authorization and data minimization apply before retrieval and at every tool; model output never grants privilege.

### 9. Preserve type and test integrity

- Keep TypeScript strict. New `any`, unsafe casts, ignored promises, broad suppressions, skipped tests, and weakened assertions are prohibited without a narrow expiring exception.
- A passing test must be capable of detecting the protected defect. Do not mock the boundary whose guarantee is under test.
- Each fix includes a regression that fails on the previous behavior for the right reason.
- Report exact commands, environment, counts, warnings, failures, skips, and untested areas.

### 10. Design for accessibility and observed performance

- Use semantic native HTML, complete keyboard/focus behavior, named/stateful controls, accessible errors, zoom/reflow, contrast, media alternatives, and reduced-motion support.
- Automated accessibility tools supplement, not replace, knowledgeable manual journey testing.
- Minimize client JavaScript, request waterfalls, unbounded lists, layout shift, and unnecessary third parties.
- Measure p75 mobile and desktop Core Web Vitals: LCP <= 2.5 seconds, INP <= 200 milliseconds, CLS <= 0.1.

### 11. Build observability and operations with the feature

- Define SLIs/SLOs and business-integrity signals for critical journeys.
- Use correlated structured traces, low-cardinality metrics, privacy-safe logs, actionable alerts, and owned runbooks.
- Test overload, dependency failure, cache miss, retry storm, queue backlog, hot keys, partial failure, telemetry failure, and recovery.
- Define capacity from a demand model and production-shaped load; never extrapolate local success to millions of users.

### 12. Protect the supply chain and release path

- Reproducible lockfile install, dependency provenance/license/security review, SBOM, secret/SAST/SCA scans, and applicable KEV gate are required.
- CI is least privilege; protected branches require non-author review and specialty owners.
- Build in approved hosted CI, sign provenance, verify artifact digest, and promote the same artifact.
- Use canaries/staged rollout with predeclared thresholds, halt authority, rollback/forward repair, and restore drills.

## Klimr-specific invariant register

These rules prevent recurrence of audit patterns and remain mandatory until replaced by a reviewed specification that is at least as safe:

| ID | Invariant |
|---|---|
| KLI-001 | Player/public Queue credentials and operator capabilities have separate issuers, audiences, scopes, storage, revocation, and tests. A join code cannot mint or substitute for operator authority. |
| KLI-002 | Public Queue/RSC/API/Realtime projections exclude operator display code/token, exact geofence, pending/private requests, private organizer data, and privileged state. |
| KLI-003 | Every privileged RPC/function explicitly authorizes its caller, uses least privilege, and is unavailable to PUBLIC/unauthorized roles including through default ACLs. |
| KLI-004 | Queue/match finalization, waitlist offers, class enrollment/capacity, tournament roster, scoring, credits/payments, and ranking transitions are atomic, constraint-backed, replay-safe, and concurrency-tested. |
| KLI-005 | Waitlist state creation and notification are durably coupled and reconcilable; expiry is based on the correct lifecycle/activity timestamp. |
| KLI-006 | Approved UGC re-enters screening on relevant edit; every published media type follows fail-closed screening and deletion/reconciliation. |
| KLI-007 | Blocking, privacy, suspension, deletion, unlisted status, mute/restrict, and moderation affect direct reads, search, feed, suggestions, AI, tags, notifications, caches, Realtime, and deep links. |
| KLI-008 | Server-provided success reflects checked results. No ignored insert/update/RPC result may silently produce partial success or duplicate downstream work. |
| KLI-009 | Private relationship/policy helpers are used by enforcement surfaces and do not expose arbitrary-pair existence/state oracles. |
| KLI-010 | Stored object deletion uses provider APIs and durable reconciliation; SQL metadata deletion is never represented as physical deletion. |
| KLI-011 | Scheduled items have independent failure boundaries and durable checkpoints; one failure cannot skip unrelated work. Offer/expiry timing comes from one product-owned configuration and orphan states alert/reconcile. |
| KLI-012 | UGC publication requires a current screening attestation bound to exact object bytes/version, media type, and scanner/policy version; production rejects stale, mismatched, mock, no-op, or unavailable screening. |

## Source crosswalk

The following are primary or authoritative professional sources. They support the rule families shown; Klimr's exact enforcement choices remain project policy.

### Secure development and verification

- [NIST SP 800-218, Secure Software Development Framework 1.1](https://csrc.nist.gov/pubs/sp/800/218/final): organizational preparation, protected development, secure production, review/testing, vulnerability response, and root-cause prevention.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) and the pinned [ASVS v5.0.0 release](https://github.com/OWASP/ASVS/tree/v5.0.0): verifiable application-security requirements whose versioned IDs and catalog can be retained with evidence.
- [OWASP SAMM](https://owasp.org/www-project-samm/): measurable secure-development maturity.
- [CISA Secure by Design](https://www.cisa.gov/sites/default/files/2023-10/SecureByDesign_508c.pdf): ownership of security outcomes, safe defaults, transparency, and elimination of recurring vulnerability classes.
- [CISA/FBI Product Security Bad Practices](https://www.cisa.gov/news-events/alerts/2025/01/17/cisa-and-fbi-release-updated-guidance-product-security-bad-practices): exploited-vulnerability, dependency, and product-security expectations.

### Authorization, API, business logic, and web security

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): least privilege, deny by default, and permission validation on every request.
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/): object/function/property authorization, resource consumption, business flows, SSRF, inventory, and third-party API risk.
- [OWASP Business Logic Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html): workflow, state, race, replay, and abuse controls.
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html): early repeatable trust-boundary/abuse analysis.
- [OWASP Secure Code Review Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html): manual review across architecture and implementation.
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/): systematic runtime security testing.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), and [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): concrete boundary controls.

### Identity and privacy

- [NIST SP 800-63-4 Digital Identity Guidelines](https://pages.nist.gov/800-63-4/) and [SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): authenticator assurance, rate limiting, lifecycle, recovery, reauthentication, and phishing resistance.
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework): privacy-risk governance, inventory, control, communication, and protection.
- [European Commission GDPR processing principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en): purpose limitation, minimization, accuracy, storage limitation, security, and accountability where applicable.
- [UK ICO Data protection by design and by default](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default/): integrate privacy at design time and default to necessary processing.

### AI risk and agentic features

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and [NIST AI 600-1 Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence): govern, map, measure, and manage AI risks across the lifecycle with use-case-appropriate evaluation and accountability.
- [OWASP Top 10 for LLM Applications v2.0 (2025)](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf): prompt injection, sensitive disclosure, supply-chain, data/model poisoning, output handling, excessive agency, misinformation, unbounded consumption, and related application risks.

### Framework and language

- [Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist), [Data Security](https://nextjs.org/docs/app/guides/data-security), [Authentication](https://nextjs.org/docs/app/guides/authentication), and [Testing](https://nextjs.org/docs/app/guides/testing): server/client boundaries, public Server Actions, DAL/DTOs, production checks, and test layers.
- [Supabase Auth cookie guidance](https://supabase.com/docs/guides/troubleshooting/how-do-i-make-the-cookies-httponly-vwweFx): its browser session client needs access to refresh tokens, so provider-managed SSR cookie controls must follow the supported architecture rather than a blanket `HttpOnly` rule.
- [React rules: Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure): render purity, idempotency, immutability, and side-effect placement.
- [TypeScript `strict`](https://www.typescriptlang.org/tsconfig/strict), [`noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html), and [TypeScript-ESLint type-checked configurations](https://typescript-eslint.io/users/configs/): type-safety foundations and lint enforcement.
- [TypeScript-ESLint `no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/) and [`no-explicit-any`](https://typescript-eslint.io/rules/no-explicit-any/): prevent unowned asynchronous failures and type erasure.

### PostgreSQL and Supabase

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API security/default privileges](https://supabase.com/docs/guides/api/securing-your-api): exposed-schema RLS, grants, views, functions, and service keys.
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [environment management](https://supabase.com/docs/guides/deployment/managing-environments): versioned schema changes and separated environments.
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod): security, database, availability, connection, backup, and operational launch preparation for the platform.
- [Supabase Storage object deletion](https://supabase.com/docs/guides/storage/management/delete-objects): use the Storage API rather than SQL metadata deletion.
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [`CREATE FUNCTION`](https://www.postgresql.org/docs/current/sql-createfunction.html), and [Privileges](https://www.postgresql.org/docs/current/ddl-priv.html): RLS bypass behavior, definer security, `search_path`, and default PUBLIC function execution.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), and [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html): concurrency semantics and durable invariants.
- [PostgreSQL query planning](https://www.postgresql.org/docs/current/using-explain.html) and [`pg_stat_statements`](https://www.postgresql.org/docs/current/pgstatstatements.html): evidence-based query performance.

### Payments and value flows

- [PCI Security Standards Council document library](https://www.pcisecuritystandards.org/document_library/) and [payment-page/e-skimming guidance](https://blog.pcisecuritystandards.org/new-information-supplement-payment-page-security-and-preventing-e-skimming): card-data scope, payment-page scripts, integrity, and monitoring. Formal scope must be confirmed with the acquirer or qualified assessor.
- [Stripe integration security guide](https://docs.stripe.com/security/guide), [webhook guidance](https://docs.stripe.com/webhooks), and [idempotent requests](https://docs.stripe.com/api/idempotent_requests): hosted low-scope integrations, raw-body signature verification, replay handling, and safe mutation retries. Equivalent authoritative provider guidance applies if Klimr uses another processor.

### Review, testing, reliability, and scale

- [Google Engineering Practices: Code Review Standard](https://google.github.io/eng-practices/review/reviewer/standard.html), [What to Look For](https://google.github.io/eng-practices/review/reviewer/looking-for.html), and [Small Changes](https://google.github.io/eng-practices/review/developer/small-cls.html): code health, independent review, comprehensive inspection, and focused changes.
- [Google SRE: Testing for Reliability](https://sre.google/sre-book/testing-reliability/), [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/), [Handling Overload](https://sre.google/sre-book/handling-overload/), and [Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/): evidence, SLOs, four golden signals, overload, retries, and capacity.
- [Google SRE Workbook: Canarying Releases](https://sre.google/workbook/canarying-releases/) and [Postmortem Culture](https://sre.google/workbook/postmortem-culture/): staged delivery and recurrence prevention.
- [CISA/FBI/ACSC Safe Software Deployment](https://www.cisa.gov/sites/default/files/2024-10/safe-software-deployment-how-software-manufacturers-can-ensure-reliability-for-customers-508c.pdf): phased delivery, testing/measurement, controlled expansion, emergency stop, recovery, and feedback.
- [AWS Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) and [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/): dual-write reliability and retry semantics.
- [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html): safe and idempotent method meaning.
- [OpenTelemetry concepts](https://opentelemetry.io/docs/concepts/), [metrics](https://opentelemetry.io/docs/concepts/signals/metrics/), and [logs specification](https://opentelemetry.io/docs/specs/otel/logs/): correlated signals, semantic telemetry, and cardinality/privacy concerns.

### Accessibility and web performance

- [W3C WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) and [WAI evaluation guidance](https://www.w3.org/WAI/test-evaluate/): Level AA criteria and the need for human evaluation.
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/): semantic patterns and keyboard interaction for composite widgets.
- [WCAG Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) and [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced): the 24 CSS-pixel AA minimum/exception model and the 44-by-44 CSS-pixel enhanced criterion used as Klimr's stricter primary-touch policy.
- [web.dev Core Web Vitals](https://web.dev/articles/vitals): LCP, INP, and CLS field thresholds at the 75th percentile.

### Supply chain and delivery

- [SLSA specification 1.2](https://slsa.dev/spec/v1.2/): protected source and signed, verifiable build provenance.
- [OpenSSF Scorecard](https://github.com/ossf/scorecard) and [Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md): branch protection, reviews, pinned dependencies, token permissions, and security tooling.
- [OpenSSF OSPS Baseline v2026.02.19](https://baseline.openssf.org/versions/2026-02-19): the pinned practical open-source project-security control snapshot used by this standard.
- [GitHub dependency review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review): pull-request visibility into dependency risk.
- [NIST software supply-chain and SBOM guidance](https://www.nist.gov/itl/executive-order-14028-improving-nations-cybersecurity/software-supply-chain-security-guidance-20): component inventory and secure supply-chain practices.
- [Vercel promoting/staged deployment guidance](https://vercel.com/docs/deployments/promoting-a-deployment): deployment promotion semantics and the distinction between a staged production deployment and a rebuild with production configuration.

### Claude instruction mechanics

- [Anthropic Claude Code memory/instructions](https://code.claude.com/docs/en/memory): project `CLAUDE.md`, scoped `.claude/rules/`, instruction loading, and the fact that instructions are model context rather than enforced configuration.
- [Anthropic Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices): explore, plan, implement, verify, and maintain clear project context.

## Maintenance

- Review this standard quarterly and after a major platform/version, legal/compliance, threat, or audit change.
- Pin assessment/release evidence to the exact standard and dependency versions used.
- Update rules through reviewed changes with rationale; never silently weaken a control to match current code.
- Maintain an exception ledger and automatically surface expired exceptions.
- Re-run the ASVS applicability review and threat model before major public scale expansion.
