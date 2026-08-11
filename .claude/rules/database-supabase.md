---
paths:
  - "supabase/**"
  - "**/*.sql"
  - "lib/supabase/**"
  - "lib/**/*db*.ts"
  - "lib/**/*repository*.ts"
  - "types/database*.ts"
---

# PostgreSQL and Supabase rules

The database is the final enforcement layer for durable data invariants. Application checks improve errors but do not replace constraints, transactions, grants, or RLS.

## Migration discipline

- Every shared schema change is an ordered, reviewed, forward migration committed with the application change.
- Never edit a migration that may have run in staging or production. Correct it with a new migration.
- Never make unrecorded Dashboard/SQL changes in a remote environment.
- Before merge, prove both a clean database reset and an upgrade from the previous production schema/data shape.
- A migration must be deterministic and safely repeatable only where explicitly designed. Do not hide failure with broad `IF EXISTS`/`IF NOT EXISTS` when drift should stop deployment.
- Design rolling compatibility: expand, deploy compatible code, backfill/reconcile, switch reads, then contract in a later release.
- Large backfills must be bounded, restartable, observable, idempotent, and separated from locking DDL when appropriate.
- Assess table locks, index-build strategy, transaction duration, statement/lock timeouts, disk growth, replication, and rollback/forward recovery.
- Do not promise rollback if the change destroys data. Name the backup, restore or forward-repair procedure and rehearse it.
- Refresh generated database types and fail CI if they differ.

## RLS and exposed schemas

- Enable RLS in the same migration that creates any table reachable through an exposed schema.
- Use explicit role- and operation-specific policies. Define both `USING` and `WITH CHECK` for writes.
- Default deny. Review multiple permissive policies for unintended `OR` expansion; use restrictive policies where required.
- Test with actual low-privilege `anon` and `authenticated` identities, at least user A/user B and different tenants/clubs. Owner, postgres, or service-role tests do not prove RLS.
- Table owners, `BYPASSRLS`, service role, and some views bypass RLS. Use `security_invoker` views where supported or keep privileged views in an unexposed schema with explicit grants.
- Index columns used in stable RLS predicates and measure performance with realistic data.
- Realtime publication is a data-exposure surface. Verify RLS, projected columns, subscription eligibility, and revocation behavior.
- Storage buckets and objects need explicit access policies. A public bucket cannot protect private paths by naming convention.

## Grants and functions

- Start from least privilege. Audit table, sequence, schema, function, and default privileges after every database change.
- Treat `proacl IS NULL` as PostgreSQL default privileges, not as no privilege. New functions normally grant `EXECUTE` to `PUBLIC`.
- Prefer `SECURITY INVOKER`.
- A justified `SECURITY DEFINER` function must:
  - live in a private/unexposed schema;
  - fully qualify referenced objects;
  - set a trusted fixed `search_path` with `pg_temp` last;
  - authenticate and authorize the caller/action/object internally;
  - avoid unsafe dynamic SQL;
  - be created, revoked from `PUBLIC`, and granted only to named roles in the same transaction;
  - have negative invocation tests under real low-privilege roles.
- Review every overloaded signature and both explicit and default ACLs. Do not write a cleanup query that skips NULL ACLs.
- Service-role access must be isolated in `server-only` modules/jobs, minimal in scope, audited, and never used merely to bypass a difficult RLS design.

## Invariants and concurrency

- Express durable invariants with `NOT NULL`, `CHECK`, `UNIQUE`, exclusion, foreign keys, and safe triggers/functions when declarative constraints are insufficient.
- Never implement scarce capacity, one-time claims, membership uniqueness, money/credits, rankings, Queue order, waitlist offers, or finalization as independent read-count-write requests.
- Use one atomic SQL command/transaction plus constraints, row/advisory locks, or Serializable isolation based on the invariant.
- For serialization failures or deadlocks, retry the entire transaction with a strict limit and jitter. Never repeat only the final statement.
- Acquire locks in a consistent documented order and keep transactions short. Do not perform network calls inside open transactions.
- Use `ON CONFLICT` only against a constraint that encodes the intended identity. Do not discard the returned error/result.
- State transitions must check old state, actor, version/precondition, and allowed next state atomically. Record who/when/why for high-impact changes.
- Every contested invariant requires synchronized multi-client tests against real PostgreSQL, not sequential mocks.

## Data lifecycle, Storage, and backups

- Define ownership, classification, retention, deletion, export, correction, and audit behavior for every new sensitive field/table/object.
- Use the Supabase Storage API to delete object bytes. Deleting `storage.objects` metadata with SQL leaves orphaned physical objects and is prohibited.
- Coordinate database and object-store state through durable, idempotent jobs with reconciliation for partial failure.
- Backups are not proven recoverability. Define RPO/RTO and regularly restore a production-shaped backup into an isolated environment, then run integrity and application checks.
- Deletion/DSAR design must cover primary rows, derived data, search indexes, caches, objects, logs, vendors, and defined backup retention.

## Required database evidence

- Clean reset from all migrations.
- Upgrade replay from the exact previous production ledger and representative data.
- Drift/catalog comparison: tables, columns, constraints, indexes, policies, grants/default privileges, functions, triggers, publications, jobs, and Storage policies.
- Real-role positive and negative RLS/RPC tests.
- Concurrency and replay tests for contested operations.
- Query plans and production-shaped load for changed hot queries; assess write cost of new indexes.
- Rollout order, timeout/lock plan, monitoring, halt condition, forward repair, and restore evidence.
