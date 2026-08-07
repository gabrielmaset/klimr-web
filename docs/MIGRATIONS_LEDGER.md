# Klimr — Migrations Ledger (authoritative)

**This file is the single source of truth for what has been applied to the
production Supabase database.** It supersedes `GO_LIVE.md` (deleted Aug 2026 —
its migration instructions stopped at 0022 and were dangerously stale) and the
old `schema_combined_*.sql` snapshots (also deleted).

**How deployment works here (deliberate, recorded decision D5):** every
migration is pasted manually into the Supabase SQL editor by Gabriel, in
order, exactly as delivered in chat with its `-- 0NNN_name.sql —` header. The
Supabase CLI is intentionally **not** part of this workflow until the first
technical hire onboards. Migrations are proven in a scratch Postgres 16
cluster before delivery. Batches flagged **risky** (destructive DDL, data
rewrites, trigger/constraint changes on hot tables) require a manual backup
download first (Supabase → Database → Backups, or `pg_dump`).

The app self-checks at boot: `lib/schema-check.ts` probes sentinel columns
and refuses to serve a production deploy against a database that is missing
migrations, pointing back to this ledger.

## Applied-through record

| Date (confirmed) | Applied through | Notes |
|---|---|---|
| ≤ 2026-08-04 | **0001 – 0171** | Cumulative history through the Klimr Web 6 session. |
| 2026-08-05 | **0172, 0173** | Waitlist offers, split pair (enum first, machinery second — Postgres cannot use a new enum value in the transaction that adds it). Confirmed run by Gabriel (decision D14). |
| 2026-08-05 | **0174** | `rank_snapshots` RLS lockdown (audit SEC-009/ADD-03). Confirmed run by Gabriel. |
| 2026-08-05 | **0175** | `court_sport_intel` evidence columns + verification attempt-stamp (audit COURT-005/007). Confirmed run by Gabriel. |
| _pending_ | **0176** | Atomic queue placement: `queue_command_log` + `place_on_team()` RPC (audit QUEUE-001/004/ADD-11 · K2-01). Race reproduced and fix proven in a scratch Postgres 16 cluster. Additive DDL, no rows rewritten — backup not required, but it touches the hot join path, so watch a session briefly after running. |
| _pending_ | **0177** | Queue state version counter + triggers + `queue_version()` RPC (audit QUEUE-003/PERF-002 · K2-02). Enables 304 cheap-unchanged polls. Additive, no rows rewritten — backup not required. |
| _pending_ | **0178** | Durable jobs: `jobs` table + enqueue/claim/complete/fail/replay RPCs (audit COURT-006/DEP-005 · K2-03). Lease via SKIP LOCKED, exponential backoff, dead-letter, replay. Additive — backup not required. |
| _pending_ | **0179** | Atomic `merge_format_config()` with optional optimistic-concurrency precondition (audit TOUR-003 · K2-04). Lost update reproduced and fix proven in scratch. Function only, no schema change — backup not required. |
| _pending_ | **0180** | Courtside device registry + `courtside_heartbeat()` (audit PROD-005/SEC-008 · K2-05). Per-install identity for fleet ops; authorizes nothing. Additive — backup not required. |
| _pending_ | **0181** | Normalized `court_evidence` provenance + `court_data_quality()` / `ranking_data_quality()` scorecards (audit DATA-003/COURT-005 · K2-06). Additive, read-only functions — backup not required. |
| _pending_ | **0182** | Courtside fleet status tiers: `courtside_fleet_status()` / `courtside_device_tiers()` — app-open vs actually running live play (founder request). Read-only functions — backup not required. |
| _pending_ | **0183** | **REPAIR — run as soon as 0176–0182 are applied.** Restores `service_role` EXECUTE on the functions added in 0176–0182 (and table grants). Without it the app gets "permission denied for function" and queue joins fail. Grants only, idempotent, no backup needed. |
| 2026-08-06 | **0184** | Courtside device auth: registration against the session join code, server-minted token stored as SHA-256, authenticated heartbeats, revocation on retire. Confirmed run by Gabriel. |
| _pending_ | **0185** | Live-fleet metrics + drill-down + force-end session; 45s presence window, 10s heartbeat floor; drops the last_seen index so heartbeats stay HOT. Additive — backup not required. |
| _pending_ | **0186** | RUM: `perf_samples` + `perf_report()` percentiles against the audit budgets + 14-day retention (K3-05). Additive — backup not required. |
| _pending_ | **0187** | `queue_poll_head()` — version + organizer id in one call so an unchanged poll can 304 BEFORE loading the snapshot. Fixes a K2-02 claim that was never true. Read-only function — backup not required. |
| _pending_ | **0188** | Search metrics (`search_deterministic` / `search_zero` / `search_ai`) + `search_zero_rate()` for the K3-08 decision; extends the perf metric enum and budgets. Additive — backup not required. |

**Update rule:** every future batch that ships migrations adds one row here in
the same commit, and the row moves from _pending_ to dated only on Gabriel's
in-chat confirmation that the paste succeeded.

## Sentinel columns (keep in step with `lib/schema-check.ts`)

| Migration | Sentinel |
|---|---|
| 0124 / 0127 / 0128 | `court_sessions.paused_by`, `court_sessions.activated_at`, `court_sessions.display_code` |
| 0173 | `join_requests.offered_at` |
| 0175 | `court_sport_intel.verifying_at` |
