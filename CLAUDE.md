# Klimr engineering contract

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative as defined by BCP 14. These rules apply to every task. An exception requires the accountable project risk owner (Gabriel Duran) and, for R2/R3, the compensating controls in "Review under a solo owner" below. Claude MUST NOT approve or silently waive an exception. No exception may waive law, contract, or provider requirements.

> **Provenance.** This contract derives from the Klimr Enterprise Engineering Rules package (ChatGPT Codex, Aug 2026), adopted with four owner-approved adaptations recorded in `docs/engineering/ADAPTATIONS.md`. The scoped rules under `.claude/rules/` are installed verbatim. Where this file and a scoped rule disagree, the stricter rule wins.

## Mission and precedence

- Preserve Klimr's modular Next.js/Supabase/PostgreSQL architecture unless an approved ADR requires a change.
- Optimize for correctness, security, privacy, operability, accessibility, and simple maintenance before speed or novelty.
- Follow, in order: explicit owner requirements, accepted specifications/ADRs, this contract and scoped rules, then existing conventions that do not conflict with them.
- If requirements conflict, a material security/privacy decision is missing, or a destructive action lacks authorization, STOP and request a decision.
- Do not add speculative architecture, microservices, packages, compatibility layers, or abstractions unrelated to the requested outcome.

## Non-negotiable conduct

- MUST inspect before editing. Read the complete relevant execution path, callers, tests, migrations, policies, jobs, types, and documentation.
- MUST preserve user changes and limit the diff to the requested task. No drive-by cleanup in high-risk changes.
- MUST NOT contact production, deploy, rotate secrets, alter remote data/schema, send real messages, or perform destructive operations without explicit authorization.
- MUST NOT weaken authorization, RLS, validation, types, tests, lint, timeouts, logging, or safety gates to make a change pass.
- MUST NOT swallow errors, discard database/API results, invent success, leave hidden fallbacks, or convert a failed safety dependency into success.
- MUST NOT claim a defect is fixed from code inspection, a green build, or a mocked test alone.
- MUST use authoritative documentation for framework, platform, security, and dependency behavior; do not rely on memory when behavior may have changed.

### MUST NOT infer a remote control from local text

A migration file does not prove a policy is live. A CI workflow does not prove a branch is protected. A harness fixture does not prove production state. A cron entry in a migration does not prove the job runs.

State what was observed and where. When the answer requires production, say so and ask — do not reason from the repository to a conclusion about the deployed system.

*This rule exists because it was violated twice in one week: a CI harness placeholder was read as production state and a working cron was declared broken; and a Drive permission scope was inferred from an empty search result that simply meant the drive was empty. Both conclusions were confident and wrong.*

## Continuity — a decision may already exist

Every session is a cold start. Assume a question has already been answered and find the
answer before producing your own.

- MUST search past conversations before deciding anything about product policy, documents,
  figures, architecture, or plans. Use content nouns from the question, not meta-words.
- MUST read `docs/DECISIONS_REGISTER.md` before proposing anything that could contradict a
  settled decision. `docs/DESIGN_DECISIONS.md` holds the reasoning; the register holds the
  conclusions.
- MUST distinguish **decided** from **proposed** from **rejected**. A decision requires a
  human turn stating it; Claude's own prior suggestion is not one, however well received.
  Check for a later session that superseded it.
- MUST NOT reconstruct a decision, document, or figure from summaries and present it as
  established. If it cannot be found, say what is missing and ask.
- MUST NOT contradict a recorded decision silently. Say so explicitly, give the reason, ask.

*Precedent: Klimr's history contains a complete rejected document set — an $825K ask with
`*_2026-08.md` filenames — sitting beside the accepted one at $900K under the original
filenames. Both look authoritative in a search result. Using the wrong one would have put a
figure $75,000 off into the data room.*

## Required start-of-task protocol

Before editing, report or record:

1. **Outcome and scope:** exact behavior to change and explicit non-goals.
2. **Risk tier:**
   - R0: documentation/style only, no behavior.
   - R1: ordinary isolated behavior.
   - R2: auth, authorization, PII/location, service role, RLS, payments, scarce capacity, rankings, Queue/Courtside, UGC/moderation, cron, cache visibility, external side effects, concurrency, or a migration that changes access, data/contracts, lifecycle/state, backfills, locking, or operational risk.
   - R3: production/destructive action, identity recovery, secret/key operations, backup/restore, or irreversible data transformation.
3. **Trust analysis:** actors, entry points, data classification, trust boundaries, and direct API paths.
4. **Invariants:** what must always remain true, including concurrent and retry behavior.
5. **Failure plan:** timeout, partial failure, retry, rollback, stale-data, and duplicate-delivery behavior.
6. **Verification plan:** the smallest test that fails before the fix plus required integration, negative, and end-to-end evidence.

Use `docs/engineering/THREAT_MODEL_TEMPLATE.md` when actors, trust boundaries, authorization, sensitive data, or abuse exposure changes; use `docs/engineering/MIGRATION_FAILURE_PLAN_TEMPLATE.md` for database-only operational risk; use both when both apply. R3 also requires explicit owner authorization before execution.

## Review under a solo owner

**ADAPTATION 1.** The source package requires a non-author qualified specialty approver for R2/R3. Klimr has one non-technical owner and an AI engineer who is also the author. Pretending that review happens would be worse than naming the gap.

The honest position: **Claude is the author and cannot be the approver.** Therefore R2/R3 requires all four of the following, and the owner approves the *decision and residual risk*, not the code line by line:

1. **A negative control.** The change is proven to fail when the protection is removed — revert the guard, watch the gate go red, restore it. A control nobody has watched fail is not a control.
2. **Adversarial self-review, written down.** Before handoff, state how this change could be wrong: which assumption is load-bearing, which path was not traced, which environment was not tested. "None" is not an acceptable answer.
3. **Independent model audit for security-relevant surfaces.** An external review pass (ChatGPT Codex or equivalent) stands in for the specialty reviewer. Its findings are recorded and dispositioned, not summarized.
4. **Owner sign-off on the residual risk**, using the completion template, before the change is treated as done.

This is weaker than a qualified human reviewer. It is recorded as `PUBLIC-GO BLOCKER` in the control register so it cannot quietly become permanent.

## Investigation rules

- Run `git status` first and identify existing/unrelated changes.
- Search for every caller and every parallel path: UI, Server Actions, Route Handlers, RSC props, REST/PostgREST, Realtime, RPC, cron, webhook, Storage, and service-role code.
- Treat every exported Server Action and Route Handler as a public endpoint.
- For a database change, inspect the full migration ledger, effective grants/default privileges, RLS, functions, triggers, publications, Storage policies, jobs, and generated types.
- For a state transition, write the state machine, allowed actors/transitions, preconditions, idempotency key, concurrency strategy, audit event, and side effects.
- Reproduce the defect or establish a precise failing invariant before implementing the fix. If reproduction is impossible, say why and label the evidence accordingly.
- **Verify the fixture before believing the result.** A test that reports zero may be measuring nothing. Establish a non-zero baseline first: prove the thing you are about to break is currently working.

## Implementation rules

- Prefer the smallest complete vertical change that closes every path through the affected trust boundary.
- Centralize authorization, audience projection, state transitions, and external-side-effect dispatch so callers cannot bypass them.
- Enforce durable business invariants in PostgreSQL constraints and atomic commands, not client/UI checks or read-count-write sequences.
- Derive actor identity, role, ownership, price, score, status, and privilege server-side from trusted state; never accept authoritative values from the client.
- Return explicit minimal DTOs. Never serialize raw database rows, secrets, restricted fields, service objects, or privileged state to Client Components.
- Make unsafe operations POST/action-only and idempotent where retries are possible. GET/rendering MUST NOT mutate durable state.
- Use bounded timeouts for external work. Retry only classified transient failures, with a limit and jitter, and only when the operation is idempotent.
- Use a transactional outbox for database-change-plus-notification/event dual writes; consumers MUST be idempotent.
- Keep behavior backward compatible across rolling application/database deployments or provide an approved staged migration and rollback plan.
- Add comments for rationale and non-obvious invariants, not a narration of syntax.

### If the fix repeats N times, N is the bug

When a remedy consists of applying the same guard in several places, the duplication is the defect. Write one predicate, one command, one loop — and search repository-wide for every instance before calling it done.

*Precedent: `is_blocked_pair()` existed and was inlined in four RLS policies because it lacked one grant. Discoverability had three definitions across three surfaces. A cron guard tested the wrong condition in ten migrations, then an eleventh used a third variant. A shim fix guarded four roles visible in the first lines of a `grep` and missed two below the cut, failing CI a second time.*

## Code quality rules

- TypeScript `strict` remains enabled. New `any`, unsafe casts, unhandled promises, and unjustified non-null assertions are prohibited.
- Validate `unknown` input at every trust boundary and keep validated types narrow thereafter.
- Prefer pure, deterministic functions and explicit dependencies. Inject clocks, randomness, and external clients where tests need control.
- Keep functions cohesive and control flow shallow. A large function/module requires decomposition or written justification; do not split merely to satisfy a number.
- Reuse established domain primitives; do not copy authorization, projection, retry, or state-transition logic.
- Every suppression (`eslint-disable`, `@ts-ignore`, skipped test, audit ignore) MUST be narrow, justified, owner-reviewed, and linked to an expiring issue.
- No placeholder implementation, silent TODO, fake response, or dead safety code may be presented as complete.
- **Delete dead code rather than renaming it aside.** A superseded helper that still works is an invitation to call it and restore the path that was removed. Git holds the history.

## Mandatory verification

Run the checks relevant to the changed surface, using Node 22 and a clean dependency install in CI:

- `npx tsc --noEmit`
- `npm run lint` — **enforced at the recorded baseline today, not deferred to zero.**
- `npm test`
- `npm run build`
- Focused regression tests proving the defect fails before and passes after.
- R2/R3: negative actor/role tests, direct API tests, abuse cases, and required concurrency/fault tests.
- Database changes: clean replay from zero, upgrade-path replay from the production baseline, real-role RLS/RPC tests, generated-type refresh, migration/catalog comparison, and rollback/forward-recovery proof.
- UI changes: production-build browser tests for keyboard, screen reader semantics, mobile widths, loading/error/empty states, and privacy of network/RSC payloads.
- Critical flows: production-like E2E plus observability and rollback verification.

Do not mock the boundary whose security or integrity is under test. A source-text assertion is not proof that runtime behavior is secure.

### Print the exit code

`command >/dev/null && echo ok` reports success by silence and failure by nothing at all. Print the status explicitly. *A type error survived two turns behind that pattern.*

### A gate with a tolerance is not a gate

Never encode a known failure as an accepted baseline inside the gate itself. If a check must pass with a known exception, the exception belongs in the thing being checked — as a guard, with a reason — not in the scoreboard as a numeric allowance.

*Precedent: the migration replay carried `[ "$fails" -le 1 ] && exit 0` with a comment saying the failure was expected. It hid a real from-zero failure for a week, in output that was read daily. The allowance did not say "0188 may fail"; it said "one migration may fail, forever, in the mode that proves the schema can be rebuilt."*

## Silent failure and canaries

**ADAPTATION 2.** The source package covers proving code correct and is thin on detecting work that silently stops happening. Klimr's most serious defects were all of this shape.

For any scheduled job, delivery path, external call, or background reconciliation:

- Ask what observable evidence exists that the work **happened**, not merely that it was **invoked**. `net.http_post` returns nothing about the response; a 307 to a login page reads as success to anything that follows redirects.
- Add or extend a canary in `klimr_health()` that measures **absence**: work older than its window, undelivered events, unswept expiries, queues past their cap.
- A canary MUST NOT assert a threshold that cannot be derived. A number nobody can justify produces false alarms, gets muted, and takes the true alarm with it.
- Check the response, not just the request. A discarded `{ error }` is a failure that will never be seen; supabase-js does not throw on a constraint violation.

*Precedent: both cron routes had never executed while Vercel reported healthy runs; five notification kinds were rejected by a constraint whose error was discarded, so nobody was ever notified of a connection request; court sessions never expired; the Feed scope selector wrote a parameter the page never read. None raised an exception, so none could be alerted on.*

## Evidence and claims

Every conclusion MUST use one of these labels:

- **Static:** source/configuration inspected only.
- **Executed-local:** command or test run locally against identified dependencies.
- **Recorded:** evidence supplied by another party but not independently rerun.
- **Staging:** executed against an isolated production-like environment.
- **Production:** observed in the exact deployed environment with timestamp/build/schema identity.

Use **fixed** only when the required acceptance tests pass at the required evidence level and no bypass path remains. Otherwise use `partial`, `contained`, `not reproduced`, `blocked`, or `production-unverified`.

Never say "all tests pass" without naming the suites and counts, and never say "production-ready," "secure," or "GO" from local evidence alone.

## Completion contract

**ADAPTATION 3.** `docs/engineering/AGENT_COMPLETION_TEMPLATE_SHORT.md` is the default for R0/R1. The full `AGENT_COMPLETION_TEMPLATE.md` is required for R2/R3 and releases. A fourteen-field template on a documentation typo gets skipped, and a template that gets skipped teaches that templates are optional.

Report:

- outcome and residual risk first;
- files and database objects changed;
- invariants and trust boundaries affected;
- commands actually run, exit status, environment, and meaningful counts;
- negative, concurrency, migration, browser, fault, and production evidence separately;
- rollout, monitoring, rollback, and data-repair steps;
- unexecuted tests and why;
- every exception, assumption, TODO, and follow-up owner.

## Required detailed rules

Follow all applicable files under `.claude/rules/`. Open them deliberately before planning:

- any code: `agent-workflow.md`, `typescript-next-react.md`, `testing-quality.md`;
- public action/route/RPC/webhook/cron/auth: `api-security.md` plus threat model and ASVS delta;
- query/data/state/migration/RLS/Storage/Realtime: `data-access-invariants.md`, `database-supabase.md` plus migration plan;
- PII/location/social/search/UGC/payment/AI: `privacy-ugc-ai.md`;
- UI: `frontend-accessibility-performance.md`;
- job/cache/dependency/load/release: `reliability-observability.md`;
- dependency/config/CI/deploy/secret: `supply-chain-ci.md`.

## Standing Klimr operating rules

These predate this contract, are owner-set, and remain in force:

- Never rebuild the deployment zip unless the owner says "rebuild".
- Migrations are delivered with a `-- 0NNN_name.sql — adds ...` header for paste into the Supabase SQL editor, and are `cat` verbatim from the repo file, never retyped.
- Every batch ends with an explicit "iPhone impact: none / [description]" line.
- `docs/DESIGN_DECISIONS.md` receives a dated entry per batch, including the mistakes.
- Python patches write to `/tmp` then `cp`, with count assertions that abort before any write on failure.
- Every page uses full desktop width; never constrain to a phone-width column on desktop.
- Build to scale: no O(users) scans on hot paths.
- Build integration-ready: support/CRM side effects go through one dispatcher seam.
