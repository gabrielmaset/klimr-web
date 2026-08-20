# Database migration and failure plan

Use for any migration with data, access, contract, lifecycle/state, backfill, locking, performance, or operational risk. Also complete the threat model when actors, trust boundaries, authorization, sensitive data, or abuse exposure changes.

## Change and compatibility

- Current production migration ledger/schema identity:
- Exact objects/data changed:
- Application versions before/during/after rollout:
- Expand/backfill/switch/contract sequence:
- Read/write compatibility across rolling deployment:
- Generated types/contracts and consumers:

## Invariants and access

- Constraints and state invariants:
- RLS, grants/default privileges, functions/search path, views, triggers, publications, Storage, and jobs affected:
- Low-privilege identities and negative cases:
- Concurrency/locking/isolation/retry behavior:
- Idempotency and partial-progress checkpoint:

## Operational analysis

- Table/data size and production-shaped estimate:
- Expected scan/rewrite/index/lock behavior:
- Statement and lock timeouts:
- Transaction duration, disk/WAL/replication/connection impact:
- Backfill batch/rate/pause/resume/retry controls:
- Provider limits or maintenance coordination:

## Rehearsal evidence

- Clean reset result:
- Upgrade from exact previous production ledger and representative data:
- Catalog/drift/grant/RLS assertions:
- Synchronized concurrency/replay tests:
- Query plans/load evidence:
- Backup/restore or forward-repair rehearsal:

## Release and recovery

- Owner, deploy order, window, and approvals:
- Metrics/logs/dashboard/alerts:
- Canary/cohort if applicable:
- Halt thresholds and kill switch:
- Rollback feasibility or forward-fix/data-repair steps:
- Verification query/journey after each phase:
- Residual risk and follow-up expiry:
