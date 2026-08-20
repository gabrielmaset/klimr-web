# Change workflow and decision discipline

These rules apply to every change.

## Before editing

1. Read `CLAUDE.md` and all path-scoped rules that apply.
2. Run `git status`; preserve user work and identify unrelated changes.
3. Restate the required outcome, observable acceptance criteria, and non-goals.
4. Assign the R0-R3 risk tier from `CLAUDE.md`. If R2 or R3, write the threat/failure model before coding.
5. Trace the complete behavior, not only the named file: callers, UI, Server Components, Client Components, Server Actions, Route Handlers, shared libraries, RPCs, tables, constraints, RLS, grants, triggers, Realtime, Storage, jobs, caches, notifications, analytics, and tests.
6. Record the invariants. Include authorization, privacy, lifecycle, concurrency, retry, and partial-failure behavior.
7. Reproduce the defect or create a minimal failing test. If impossible, record why and do not describe a theory as a reproduction.

## While editing

- Make the smallest coherent vertical change that meets the acceptance criteria and closes every affected path.
- Keep behavior changes separate from unrelated refactors, formatting, dependency upgrades, and schema cleanup.
- Follow existing domain primitives when they are safe. Remove or consolidate a bypassing parallel path rather than adding another copy.
- Search repository-wide for the root-cause pattern and inspect each reachable instance.
- Do not invent requirements, credentials, runtime results, migrations, APIs, or product decisions.
- Do not edit generated files by hand. Change the source and regenerate them with the documented command.
- Do not modify a migration already applied to a shared environment. Add a forward migration.
- Do not add a dependency when the platform or an existing reviewed dependency already provides the capability.
- Do not leave an unfinished safety condition behind a TODO, feature comment, permissive fallback, or placeholder response.

## Review discipline

- Self-review the final diff line by line for correctness, security, privacy, compatibility, and scope.
- A change is not approved merely because Claude wrote and reviewed it. Every production change needs human review; R2/R3 needs a reviewer qualified for the affected specialty.
- Review facts, reproducible evidence, and user impact before style preference.
- If a reviewer cannot readily understand a high-risk path, simplify it or document the invariant and reason.
- Never dismiss a security or reliability finding because exploitation is inconvenient. Establish reachability and runtime controls with evidence.

## Stop conditions

Stop and request a decision when:

- requirements disagree about who may see or do something;
- a privacy purpose, retention period, legal/compliance owner, or destructive-data policy is missing;
- a change requires production access, secret rotation, real messages/payments, deployment, or remote mutation not explicitly authorized;
- the proposed fix would weaken an existing guarantee or silently break compatibility;
- required evidence needs an unavailable environment or credential;
- existing user changes overlap materially and cannot be preserved safely.

## Evidence integrity

- Report the exact command, environment, exit result, meaningful test count, and warnings.
- Separate Static, Executed-local, Recorded, Staging, and Production evidence.
- Never call a skipped, mocked, quarantined, or source-text-only check an end-to-end test.
- Never hide failures by truncating output, filtering logs, changing expected values, disabling checks, or retrying until green without diagnosis.
- If a command was not run, say `not run` and why.
- If a test uses placeholders, mocks, service role, or a synthetic database, name that limitation.

## Completion

Use `docs/engineering/AGENT_COMPLETION_TEMPLATE.md`. A handoff is incomplete without residual risks, unverified areas, rollout/rollback, and named follow-ups.
