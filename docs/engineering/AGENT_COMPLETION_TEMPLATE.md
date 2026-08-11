# Claude implementation handoff

Claude must complete every field. Use `Not applicable - <reason>` or `Not verified - <reason>`; do not delete fields or replace missing evidence with an assertion.

## 1. Outcome and decision

- Requested outcome:
- Delivered behavior:
- Risk tier (R0/R1/R2/R3) and reason:
- Current decision: complete / partial / blocked / production-unverified
- Residual user/business risk:
- Explicit non-goals:

## 2. Change inventory

- Source files changed:
- Tests/fixtures changed:
- Migrations, tables, functions, policies, grants, triggers, publications, Storage, cron/jobs changed:
- Dependencies/configuration/feature flags changed:
- Public/API/schema contracts changed:
- Generated artifacts refreshed:
- Unrelated pre-existing changes preserved:

## 3. Security, privacy, and correctness model

- Actors and trust boundaries:
- Data classification and audience/field projection:
- Authorization matrix or ASVS requirement IDs:
- Durable invariants:
- State transitions and invalid transitions:
- Concurrency/locking/idempotency strategy:
- Timeouts/retries/partial-failure behavior:
- Audit/notification/outbox behavior:
- Abuse/rate/cost limits:
- Root cause and repository-wide variant search:

## 4. Evidence ledger

Use only: Static, Executed-local, Recorded, Staging, or Production.

| Evidence level | Revision/build/schema | Environment and identities | Command/scenario | Exact result/count/duration | Limitations/artifact |
|---|---|---|---|---|---|
| Static | | | | | |
| Executed-local | | | | | |
| Recorded | | | | | |
| Staging | | | | | |
| Production | | | | | |

## 5. Required verification results

- Regression test that fails on the previous implementation:
- Strict TypeScript:
- ESLint (new warnings and touched-file warnings):
- Unit/integration tests (files/tests, pass/fail/skip):
- Production build/start smoke:
- Direct API/Server Action negative tests:
- Real-role RLS/RPC tests (anon, user A, user B, privileged/revoked):
- Clean database reset and previous-release upgrade:
- Grants/default ACL/SECURITY DEFINER/catalog drift checks:
- Synchronized concurrency/replay tests:
- Browser/RSC/network sensitive-field inspection:
- Accessibility manual and automated tests:
- Performance/load/fault/dependency tests:
- SAST/secret/dependency/license/SBOM checks:
- Staging/production verification:

## 6. Unverified work

List every relevant check not run, why it was not run, impact on the conclusion, required environment/credential, and owner. `None` is allowed only after reviewing the full list above.

## 7. Release and operations

- Application/database rollout order:
- Feature flag/kill switch, owner, and expiry:
- Required config/secrets and safe missing-config behavior:
- SLI/SLO and business-integrity signals:
- Dashboards/alerts/runbooks and expected events:
- Canary cohort, observation period, expansion gate, and halt threshold:
- Rollback or forward-fix procedure:
- Data repair/reconciliation procedure:
- Backup/restore/RPO/RTO evidence:
- On-call/incident owner:

## 8. Review and exceptions

- Independent human reviewer(s) and specialty:
- Open assumptions/questions:
- Rule exceptions with approver, compensating control, issue, expiry, and removal plan:
- TODO/follow-up issue, owner, severity, and due date:
- Final statement of what this evidence does **not** prove:
