# R2/R3 threat and failure model

Complete this before implementation. A diagram is optional; the tables and decisions are not.

## Scope

- Requested behavior:
- Non-goals:
- Entry points and direct/bypass paths:
- Components, services, database objects, Storage, Realtime, jobs, providers, and caches:
- Deployment/configuration assumptions:

## Actors and assets

| Actor | Authentication | Intended permissions | Prohibited outcomes |
|---|---|---|---|
| Anonymous | | | |
| Ordinary user/self | | | |
| Other user/cross-tenant | | | |
| Organizer/operator/moderator/support/admin | | | |
| Suspended/revoked/blocked/restricted | | | |
| Service/job/provider | | | |

| Asset/data | Classification | Allowed audiences/fields | Integrity/lifecycle requirement |
|---|---|---|---|
| | | | |

## Trust boundaries and data flow

For each hop, record source, destination, protocol/interface, input, credential/identity, validation, authorization, data projection, timeout/retry, and logging. Include UI, Server Actions, routes, RPC/PostgREST, database/RLS, Realtime, Storage, jobs, webhooks, cache, analytics, and AI tools that apply.

## Invariants and state

- Authorization invariants:
- Privacy/audience invariants:
- State machine and allowed actor transitions:
- Uniqueness/capacity/money/ranking invariants:
- Idempotency/replay invariant:
- Ordering/freshness/cache invariant:
- Retention/deletion/audit invariant:

## Abuse and failure cases

| Threat/failure | Preconditions | User/business impact | Preventive control | Detective/recovery control | Required test |
|---|---|---|---|---|---|
| Cross-object/tenant access | | | | | |
| Field tampering/mass assignment | | | | | |
| Direct endpoint/RPC invocation | | | | | |
| Replay/duplicate/out-of-order | | | | | |
| Concurrent conflict/race | | | | | |
| Resource/cost abuse | | | | | |
| Dependency timeout/outage | | | | | |
| Partial database/event/object-store failure | | | | | |
| Cache/Realtime stale permission | | | | | |
| Sensitive-data egress | | | | | |
| Injection/SSRF/upload/prompt abuse | | | | | |
| Rollout/schema-version mismatch | | | | | |

## Decisions

- Controls selected and alternatives rejected:
- Database constraints/locks/isolation:
- Credential/capability scope and revocation:
- Rate, size, time, retry, queue, and cost bounds:
- Monitoring/alerts/reconciliation:
- Rollout, halt, rollback/forward repair, and data repair:
- Residual risk and human approver:
- Applicable ASVS IDs and evidence rows:
