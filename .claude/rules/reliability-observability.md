---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.sql"
  - "next.config.*"
  - "supabase/**"
  - ".github/**"
  - "Dockerfile*"
  - "package.json"
---

# Reliability, scalability, and observability rules

"Millions of users" is a capacity objective that must be decomposed and measured. Never claim scale readiness from framework choice, code inspection, or a local load test.

## Reliability design

- Define user-centered SLIs and SLOs for critical journeys: sign-in/recovery, feed/search, posting/media, Queue/Courtside, registration/waitlist, classes/tournaments, messages/notifications, payments, moderation, and deletion/export.
- Specify availability, correctness/freshness, and latency targets using percentiles and an observation window. Define an error budget and release policy.
- Track latency, traffic, errors, and saturation with both black-box journey probes and white-box service telemetry.
- Identify each dependency, timeout, retry policy, failure mode, degradation behavior, data-consistency impact, and recovery owner.
- Fail closed for authorization, privacy, integrity, payment, or moderation safety. Graceful degradation must preserve the affected invariant.
- Provide explicit loading, timeout, stale, partial, retry, and unavailable states; never disguise failure as empty success.
- Liveness answers only whether the process should be restarted; readiness reflects whether it can safely serve. Health endpoints expose no secrets or sensitive dependency detail.
- On uncaught exceptions or unrecoverable invariant failure, record bounded diagnostics, stop readiness, drain safely, and terminate for supervised restart. Do not resume normal work from an undefined process state.
- Graceful shutdown stops new work, drains requests/jobs within a deadline, closes resources, and is tested under deployment and termination signals.

## Timeouts, retries, and idempotency

- Every network/database/queue operation has a bounded timeout consistent with the caller's total deadline and supports cancellation where practical.
- Retry only classified transient failures. Use exponential backoff with jitter, strict attempt/deadline limits, and a retry budget.
- Retry amplification across layers is prohibited; designate one layer as retry owner.
- Mutations that may be retried have a stable operation-scoped idempotency key and durable deduplication/result semantics.
- Scheduled and async jobs assume duplicate, delayed, overlapping, out-of-order, skipped, and partially completed execution.
- Job state and checkpoints are durable, restartable, observable, and reconcilable. Do not mark work complete before durable side effects are owned.
- Isolate failures per item/task so one malformed record or delivery failure cannot abort unrelated work. Continue only where the invariant remains safe; retain the failed item with reason, attempts, next action, and alert/dead-letter ownership.
- Time windows, expiry, and retry policy come from one validated product-owned configuration/spec. A migration or worker must not silently hard-code or change product behavior.
- Database change plus event/email/notification uses a transactional outbox or equivalent atomic design; consumers are idempotent.

## Capacity and overload

- Establish a demand model: active users, requests/events per journey, peak-to-average factor, fan-out, payload/storage growth, regions, and dependency quotas.
- Load-test production-shaped data, authorization/RLS, caches, queues, media, and realistic traffic mix. Measure p50/p95/p99 latency, throughput, errors, saturation, queue depth/age, database connections/locks, and downstream limits.
- Test normal peak, expected launch spike, dependency slowdown, retry storm, hot key/celebrity fan-out, cache miss, job backlog, and regional/service outage.
- Bound queues, pagination, batch sizes, concurrency, memory, response size, uploads, and downstream spend.
- Apply admission control, backpressure, load shedding, and priority so noncritical work cannot starve critical operations.
- Cache only with explicit correctness, privacy, invalidation, staleness, and stampede controls. A cache must not broaden audience.
- In-memory caches, locks, idempotency maps, counters, and rate limits are process-local and cannot enforce a cross-instance invariant. Use a shared durable/coordinated mechanism when correctness or global protection depends on it.
- Database performance work is based on query plans and observed shapes. Avoid unbounded scans, N+1 requests, and indexes added without measuring write/storage impact.
- Publish a capacity limit and headroom; do not extrapolate a single-node local result to public scale.

## Observability

- Use OpenTelemetry-compatible structured traces, metrics, and logs with stable semantic naming and request/trace correlation.
- Log UTC timestamp, service/build/schema, environment, event/reason code, outcome, latency, and privacy-safe actor/resource classes as needed.
- Never log secrets, full tokens/cookies, payment card data, private content, exact location, or unnecessary PII. Sanitize untrusted log fields against injection.
- Keep metric attributes low-cardinality. Do not use user IDs, raw URLs/search queries, tokens, arbitrary error text, or object IDs as metric labels.
- Monitor SLOs, four golden signals, dependency health, queues/jobs, database pool/locks/slow queries, cache behavior, webhook reconciliation, security events, and business-integrity invariants.
- Alerts must be actionable and include owner/runbook. Page only for urgent user-impacting conditions; use tickets/dashboards for nonurgent work.
- Maintain reviewed artifacts: SLO catalog, telemetry event/attribute schema, sampling/cardinality/retention/cost policy, dashboard/runbook index, deployment annotations, and alert-test evidence.
- Use multi-window burn-rate alerts for SLOs where practical and pair technical signals with domain-integrity metrics: capacity conflicts, Queue/Courtside invalid state, outbox/job age and retries, waitlist offers without delivery, Realtime freshness, privileged denials, moderation backlog, and backup/restore age.
- Test that required telemetry and alerts fire, and define behavior when telemetry is unavailable so it cannot exhaust or block the service.

## Release and recovery

- Build once in approved CI and promote the identical immutable artifact through environments.
- Keep environments isolated. Production secrets/data do not enter preview or local systems.
- Risky changes use a kill switch/feature flag with owner, expiry, safe default, and tested disable path.
- Use staged rollout/canary with predeclared health/SLO/business-integrity gates, observation period, halt thresholds, and automatic/manual rollback authority.
- Separate application and database rollout where compatibility demands it. Verify build revision and migration ledger at runtime.
- Before release, document rollback or forward fix, data repair/reconciliation, config restore, communication, and on-call coverage.
- Backups require restore drills. Measure achieved RPO/RTO and verify restored application integrity.
- Database backup/PITR and Storage object recovery are separate capabilities. Evidence must cover both; neither documentation nor a database-only backup proves media recovery.
- High-severity incidents receive blameless, evidence-based postmortems with root cause, contributing conditions, detection gap, owned actions, deadlines, and recurrence-prevention control.

## Public-GO evidence

Public GO requires production-like evidence for SLOs, load/headroom, failover/degradation, security/privacy, restore, staged deployment, rollback, alerting, and incident response. Local unit tests and a build are necessary but never sufficient.

Coordinate heavy load/fault tests with infrastructure providers, use isolated staging with production-shaped de-identified data, enforce cost/safety limits, and never aim unapproved load at production. Until database PITR and tested database-plus-Storage restore meet approved RPO/RTO, they remain explicit public-GO blockers.
