# Enforcing the Klimr engineering rules

## The core principle

`CLAUDE.md` is guidance loaded into Claude's context. It is not a permission system and cannot prove that Claude complied. Enforce non-negotiable outcomes independently in source control, CI, PostgreSQL, deployment policy, and production monitoring.

This checklist describes the target control system. First classify every row in `CONTROL_REGISTER_TEMPLATE.md` as `ENFORCED NOW`, `RATCHET/ADOPTION`, or `PUBLIC-GO BLOCKER`. Do not claim a check is required/enforced until the protected branch actually executes it and fails a deliberately noncompliant case. Legacy non-security debt may ratchet; security/integrity blockers may not be normalized.

Use three layers:

1. **Prevent:** types, schemas, constraints, RLS, least-privilege grants, safe defaults, branch protection, CODEOWNERS, and limited CI/deployment credentials.
2. **Detect:** tests, linters, SAST, secret/SCA scans, migration/catalog audits, telemetry, alerts, reconciliation, and audit logs.
3. **Respond:** kill switches, rollback/forward repair, credential revocation, restore drills, incident ownership, and postmortems.

## Installation acceptance

- [ ] Copy this package's `CLAUDE.md`, `.claude/`, and `docs/engineering/` into the Klimr repository root.
- [ ] Commit them in a reviewed pull request.
- [ ] Run Claude Code `/context` from the repository and verify the project instructions and applicable scoped rules appear; use `/memory` for memory settings.
- [ ] In a controlled test, use Claude Code's `InstructionsLoaded` hook event to record which project/rule files load for representative API, migration, UI, job, and configuration files; fix any missing glob. `/context` alone does not exercise every path-scoped rule.
- [ ] Ask Claude to summarize the R0-R3 process and stop conditions without showing it the text again.
- [ ] Resolve conflicting old instruction files; keep one authoritative rule hierarchy.
- [ ] Add this completion template to the normal implementation workflow.
- [ ] Treat changes to these rules as production-control changes requiring owner and security/reliability review.

## Claude client enforcement

Where Claude Code is administered for the team, use managed settings and narrowly reviewed `PreToolUse` hooks for controls that must hold regardless of model behavior. Examples include denying access to production credential paths, blocking direct deployment/destructive database commands from ordinary sessions, and requiring an approved wrapper for remote mutations. Keep hook logic version-controlled, tested, fail-safe, and owned; a hook is not a replacement for CI, cloud IAM, or database authorization.

Do not give Claude broad production credentials and then ask a prompt not to use them. Least-privilege credentials, environment isolation, command/file deny rules, approval boundaries, and audit logs are the enforcement layer.

## Required protected-branch policy

- [ ] No direct push, force push, or branch deletion for production/release branches.
- [ ] At least one non-author human approval for ordinary changes; qualified CODEOWNER approval for R2/R3 surfaces.
- [ ] Dismiss stale approvals when commits change.
- [ ] Require branches to be current and every required check to pass.
- [ ] Restrict merge/deploy bypass to named humans; audit emergency use and verify afterward.
- [ ] Require phishing-resistant MFA for source control, CI, cloud, database, deployment, support/admin, payment, and moderation access.
- [ ] CI tokens are read-only by default and receive narrowly scoped per-job permissions.
- [ ] Untrusted pull requests receive no secrets, write tokens, privileged runners, or production network access.

Suggested CODEOWNERS coverage:

| Surface | Qualified owner required |
|---|---|
| `supabase/**`, migrations, generated DB types | Database plus security |
| auth/session/middleware/DAL/RLS/RPC/grants/service role | Security |
| payments/webhooks/credits/refunds | Payments/security |
| Queue/Courtside, classes, tournaments, waitlists, rankings | Domain plus database/reliability |
| privacy/location/UGC/moderation/deletion/export | Privacy/security/domain |
| workflows, deployment, secrets, infrastructure | Platform/security/reliability |

## Pull-request evidence gate

Every PR must include the appropriate handoff template. These are target required checks where applicable; their current enforcement/adoption state belongs in the control register:

- [ ] Clean `npm ci` using the committed lockfile and supported Node 22 runtime.
- [ ] Formatting check.
- [ ] `npx tsc --noEmit`.
- [ ] `npm run lint` with no new warnings and zero warnings in touched files.
- [ ] `npm test` with exact file/test counts.
- [ ] `npm run build` and production-build smoke where applicable.
- [ ] Regression test that fails on the previous implementation.
- [ ] Preview/browser E2E for affected critical journeys and direct API/Server Action tests.
- [ ] Static analysis, secret scan, dependency/SCA, license policy, malicious-package checks, and SBOM.
- [ ] Security header/CSP/CORS/cookie and sensitive-data egress tests for web boundary changes.

Klimr currently has an acknowledged ESLint warning backlog. Do not normalize it or block all work overnight:

1. Record the exact warning baseline on the protected branch.
2. Fail a PR if its total exceeds the baseline or if a touched file has any warning.
3. Track a ratchet issue and lower the baseline as warnings are fixed.
4. When zero is reached, enforce `--max-warnings 0` globally and remove grandfathering.

Only legacy non-security warnings belong in this ratchet. Known audit P0/P1 findings, secrets, authorization/privacy/RLS bypasses, schema-integrity failures, required acceptance-test failures, applicable KEVs, and exploitable high/critical production vulnerabilities remain release/GO blockers.

## Feasible test cadence

| Cadence | Minimum target |
|---|---|
| Pull request | Clean install; schema replay; touched lint/no-new-warning ratchet; strict types; unit tests; build; affected integration/direct API and automated accessibility checks; security/supply-chain checks that are fast and deterministic |
| Nightly | Real local-Supabase role/RLS/RPC, synchronized concurrency, property/fault tests, full secret/SAST/SCA/license scan, and critical browser E2E/accessibility journeys |
| Pre-release | Complete ASVS delta/matrix review, production-shaped load/failure test, supported assistive-technology matrix, migration upgrade, backup/restore, staged rollout, halt, and rollback/forward-repair drill |
| Production | Privacy-safe synthetic critical journeys, SLO/error-budget and domain-integrity monitoring, alert delivery tests, reconciliation, deployment annotations, and backup/restore-age monitoring |

For a regression, prove the new test fails against the previous behavior by a safe local revert, controlled mutation, or equivalent demonstrated fixture. It need not become a permanent CI job that rebuilds the old version.

## Database and Supabase gate

Required whenever application/data behavior depends on PostgreSQL, RLS, RPC, Storage, Realtime, or a migration:

- [ ] Clean local `supabase db reset` from all committed migrations.
- [ ] Upgrade replay from the exact previous production migration ledger and representative data.
- [ ] No edited already-released migrations and no unrecorded remote drift.
- [ ] Generated TypeScript database types are fresh.
- [ ] Catalog audit covers RLS enabled/forced state, policies, grants, default privileges, `proacl IS NULL`, overloaded functions, `SECURITY DEFINER`, fixed `search_path`, triggers, views, publications, Storage policies, and scheduled jobs.
- [ ] Tests run with real `anon` and `authenticated` JWT/roles, at least user A/user B and different tenants/clubs; service-role tests are separate.
- [ ] Every new exposed table defaults deny and has operation/role-specific RLS with `WITH CHECK` for writes.
- [ ] Every privileged function is revoked from `PUBLIC` in the same transaction and granted only to named roles.
- [ ] Scarce/unique/financial/state-machine invariants have constraints and synchronized multi-client tests.
- [ ] Migration lock time, duration, data impact, rollout order, halt condition, forward repair, and restore path are reviewed.
- [ ] Storage deletion uses the Storage API and reconciliation verifies both object bytes and metadata.

## High-risk feature gates

### Authorization and private data

- [ ] A CI-audited inventory covers every Server Action, Route Handler/legacy API route, RPC/function, webhook, cron/job entry, Realtime publication/channel, Storage bucket/path, and Edge Function with owner, intended callers, auth/object/field policy, audience DTO, limits, and tests; unregistered boundaries fail.
- [ ] Actor/action/object/field matrix covers anonymous, self, other user, tenant/club, organizer, moderator/admin, suspended/revoked, and relationship/privacy states.
- [ ] Every direct Server Action, Route Handler, RPC, Realtime, and Storage path is exercised without its UI.
- [ ] HTML, RSC/Flight, JSON, URLs, browser storage, caches, logs, telemetry, analytics, and errors contain no forbidden fields.
- [ ] Cache/revocation tests prove permission changes take effect.

### UGC and media

- [ ] Private quarantine and fail-closed scanning for every supported media type.
- [ ] Adversarial corpus covers spoofed MIME/extension, malformed/polyglot, oversized bytes/pixels/decompression, active content, scanner timeout/failure, unauthorized retrieval, edit-after-approval, and deletion/reconciliation.
- [ ] End-to-end upload test proves the real production-class adapter runs and publication verifies an attestation bound to exact object key/version, strong digest, media type, scanner/policy version, result, and timestamp; stale/mismatched/tampered/mock/no-op results are rejected.
- [ ] Owner-approved illegal-content/CSAM policy defines provider, escalation, evidence access/retention, reporting, responder safety, false positives/appeals, and qualified legal/safety review.
- [ ] Report/block/delete/moderation lifecycle works from every content surface.

### Payments and value

- [ ] Provider-hosted flow keeps PAN/CVV outside Klimr.
- [ ] Raw-body signature, stale/forged/duplicate/out-of-order webhook, idempotency, client-tampered value, provider outage, refund/reversal, and reconciliation tests pass in provider sandbox.
- [ ] Qualified reviewer confirms PCI scope assumptions; Claude does not self-certify compliance.

### Queue, waitlist, class, tournament, ranking

- [ ] Player/public and operator capabilities are cryptographically and logically separate.
- [ ] Public state projection contains no operator code, exact geofence, pending/private state, or privilege.
- [ ] Atomic state/capacity/uniqueness constraints pass synchronized conflict and replay tests.
- [ ] Notifications/events are durably coupled through outbox/reconciliation.
- [ ] Expiry, reuse, cancellation, reactivation, duplicate roster, scoring, and rollback paths are tested.
- [ ] Each scheduled item/task has an independent failure boundary and durable checkpoint; tests prove one failure cannot skip unrelated jobs and orphaned offer/notification states alert and reconcile.
- [ ] Offer/expiry windows come from one validated product-owned setting/spec and cannot change silently in a migration or worker.

## Supply-chain and artifact gate

- [ ] New dependencies/actions/images have necessity, provenance, maintenance, license, permission/data-flow, and footprint review.
- [ ] Third-party Actions and images are pinned to immutable identifiers.
- [ ] Release SBOM is CycloneDX or SPDX and retained with the build.
- [ ] No applicable CISA KEV or known exploitable critical/high production vulnerability. Exceptions include reachability, compensating control, approval, owner, expiry, and VEX-style rationale.
- [ ] Production artifact is built only by approved hosted CI from a protected revision.
- [ ] Signed SLSA Build L2 provenance is generated and verified; reach Build L3 before large-scale public launch.
- [ ] The same immutable digest is promoted through environments.
- [ ] For Vercel, a staged production deployment passes Deployment Checks and that exact deployment is promoted; do not treat a separate GitHub CI build as the served artifact unless Vercel deploys it without rebuilding.

## Staged release and public-GO gate

Green CI is not a GO decision. Before public launch or major expansion, require evidence for:

- [ ] User-centered SLOs, error budgets, ownership, dashboards, alerts, and runbooks for critical journeys.
- [ ] SLO catalog; telemetry schema; sampling/cardinality/retention/cost policy; dashboard/runbook index; deployment annotations; multi-window burn alerts where applicable; and alert-test evidence.
- [ ] Domain-integrity monitoring for capacity conflicts, Queue/Courtside state, outbox/job age and retries, waitlist delivery, Realtime freshness, privileged denials, moderation backlog, and backup/restore age.
- [ ] Production-shaped load model and tests: realistic data/roles, peak mix, p50/p95/p99, database pool/locks, queues, dependencies, hot keys, cache miss, retry storm, and measured headroom.
- [ ] Failure tests for dependency slowdown/outage, overload, job backlog, partial failure, retry/replay, and telemetry failure.
- [ ] Field Core Web Vitals at p75: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 for mobile and desktop.
- [ ] WCAG 2.2 AA coverage of complete journeys with automated and knowledgeable manual testing; 44x44 CSS-pixel primary touch target policy.
- [ ] Canary plan with cohort, observation window, absolute and comparative health/integrity thresholds, halt authority, and tested rollback/forward repair.
- [ ] Backup restoration drill proving achieved RPO/RTO and application/data integrity.
- [ ] Database backup/PITR and Storage-object recovery are each configured and restored; a database-only backup is not Storage recovery. Until both meet approved RPO/RTO, public GO remains blocked.
- [ ] Security incident, secret revocation, payment reconciliation, data repair, and user communication procedures.
- [ ] OWASP ASVS 5.0.0 Level 2 applicability/evidence matrix and selected Level 3 evidence for high-risk surfaces.
- [ ] Independent security, privacy, database, reliability, accessibility, and product acceptance for their respective scope.

## Exception record

An exception is valid only when it records:

- rule/control and exact scope;
- evidence that compliance is currently infeasible;
- risk and affected users/data;
- compensating control and how it is monitored;
- named owner and human approver;
- for R2/R3, a non-author approver qualified in the affected specialty;
- linked issue, due date, and automatic expiry;
- rollback/containment trigger.

Claude may propose an exception but may not approve, hide, renew, or broaden it. No exception may waive law, contract, or provider requirements.
