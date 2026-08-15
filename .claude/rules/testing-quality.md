---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.sql"
  - "tests/**"
  - "test/**"
  - "e2e/**"
  - "package.json"
  - "vitest.config.*"
  - "playwright.config.*"
  - ".github/**"
---

# Testing and quality gates

Tests are evidence that specific claims held under identified conditions. They are not proof of general correctness.

## Test design

- Every bug fix adds a regression test that fails for the old behavior for the right reason and passes after the fix.
- Every new behavior maps acceptance criteria and risks to tests before implementation is called complete.
- Use the smallest appropriate layers:
  - unit tests for pure domain rules and edge cases;
  - integration tests for real database, RLS/RPC, queues, Storage adapters, and third-party contracts;
  - API/Server Action tests for public trust boundaries;
  - browser E2E for critical user journeys and serialization/accessibility behavior;
  - production/staging probes for deploy, configuration, telemetry, and infrastructure assumptions.
- Prefer deterministic tests. Inject clocks/randomness, freeze time, isolate data, and control network behavior.
- Assert user-visible and durable outcomes, not internal implementation details alone.
- A test must be capable of failing when the protected behavior breaks. Source-text/regex assertions are guardrails, not runtime proof.

## Mandatory case classes

For affected behavior, test all applicable cases:

- happy path and documented boundary values;
- empty, missing, malformed, oversized, duplicate, stale, and unknown fields;
- anonymous, wrong user, wrong tenant/club, wrong role, revoked/suspended, blocked/muted/restricted;
- direct endpoint invocation without UI navigation;
- replay, retry, timeout, cancellation, provider error, and partial failure;
- two or more synchronized conflicting clients for scarce/unique/financial/state-machine invariants;
- cache invalidation, RSC serialization, Realtime subscription/revocation, and eventual reconciliation;
- clean install/build/schema plus upgrade from the previous released version;
- keyboard, screen reader semantics, zoom/reflow, mobile touch, loading/error/empty/offline states;
- production-like volume and failure mode for hot or high-cost paths.

## Test integrity

- Do not delete, skip, weaken, quarantine, snapshot-update, or change expected behavior merely to get green.
- Do not mock the boundary whose guarantee is being tested: use real low-privilege PostgreSQL roles for RLS, a real signature verifier for webhook tests, and real browser payload inspection for serialization privacy.
- Service-role success does not prove user access safety.
- Passing sequential calls do not prove concurrency safety.
- A mocked external service does not prove staging/production credentials, network, quota, or webhook configuration.
- A flaky test must be fixed or isolated with an owner, evidence, and expiry; blind retries are not a solution.
- Keep test fixtures free of real personal data and secrets.

## Required local/CI baseline

- Clean dependency install from the committed lockfile under the supported Node 22 runtime.
- Strict TypeScript check: `npx tsc --noEmit`.
- ESLint: no new warnings, and every touched file warning-free. Ratchet the existing baseline down; once zero, enforce global `--max-warnings 0`.
- Unit/integration tests: `npm test`, with exact file/test counts reported.
- Production compilation: `npm run build`.
- Database work: clean reset, previous-release upgrade replay, real-role security tests, catalog/grant drift checks, generated types, and required concurrency cases.
- UI/API work: preview/production-build browser and direct API tests.
- Security/supply chain: SAST, secret scan, dependency/SCA and license policy, SBOM, and relevant DAST/adversarial tests.

## Coverage policy

- Coverage is a diagnostic, not a substitute for meaningful assertions.
- New/changed critical domain code needs branch and mutation-quality evidence appropriate to risk. If a numeric threshold is used, it is a floor, not a target to game.
- Track critical journeys and invariants explicitly; 100% line coverage with missing authorization/concurrency cases is inadequate.

## Evidence record

For each gate, record command, revision, runtime/dependencies, environment, exit status, test counts, duration, warnings, and limitations. Preserve CI links/artifacts for releases.
