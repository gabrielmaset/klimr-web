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
| 2026-08-07 | **0176 – 0183** | Atomic queue placement + `queue_command_log`/`place_on_team()` (0176); queue state version + `queue_version()` (0177); durable `jobs` table and its RPCs (0178); atomic `merge_format_config()` (0179); courtside device registry + `courtside_heartbeat()` (0180); `court_evidence` + data-quality scorecards (0181); fleet status tiers (0182); **0183 grant repair** restoring `service_role` EXECUTE on 0176–0182's functions. Confirmed applied — verified by catalog fingerprint, not by assertion. |
| 2026-08-06 | **0184** | Courtside device auth: registration against the session join code, server-minted token stored as SHA-256, authenticated heartbeats, revocation on retire. Confirmed run by Gabriel. |
| 2026-08-07 | **0185 – 0188** | Live-fleet metrics + drill-down + force-end session (0185); RUM `perf_samples` + `perf_report()` (0186); `queue_poll_head()` (0187); search metrics + `search_zero_rate()` (0188). Confirmed applied. **Note on 0188:** the copy in this repo cannot create `search_zero_rate` — its query is missing a `from s` — yet production has a working one. A corrected copy was pasted at the time and never returned to the repo. 0189 closes the gap; see `KCDX-004_replay_evidence.md`. |
| 2026-08-07 | **0189** | **Schema reconciliation (KCDX-004).** Six drift objects recorded in the history for the first time: `profiles.avatar_path`; both 0188 function bodies (production's text adopted verbatim); `avatars` bucket size/MIME limits; four duplicate dashboard-created `avatars` Storage policies dropped; and the schema-wide revoke of INSERT/UPDATE/DELETE from `anon`, extended to default privileges so future tables cannot regain it. Every statement idempotent. Confirmed run by Gabriel; all fifteen catalog measures then matched a clean replay. |
| _pending_ | **0190** | `schema_manifest_missing()` — the boot sentinel's catalog check. Read-only, `service_role` only. Lets `lib/schema-check.ts` verify tables, functions **and `service_role` EXECUTE grants** rather than columns alone; the 0183 failure mode was invisible to a column probe. Additive, function only — backup not required. |

**Update rule:** every future batch that ships migrations adds one row here in
the same commit, and the row moves from _pending_ to dated only on Gabriel's
in-chat confirmation that the paste succeeded.

## Sentinels (keep in step with `lib/schema-check.ts`)

Two layers. Column probes need no database objects and survive an empty manifest; the manifest catches everything a column probe structurally cannot.

| Layer | Covers |
|---|---|
| Column probes | `court_sessions.paused_by / activated_at / display_code` (0124/0127/0128) · `join_requests.offered_at` (0173) · `court_sport_intel.verifying_at` (0175) |
| `schema_manifest_missing()` (0190) | Every app-required table and function from 0176–0189, **plus `service_role` EXECUTE on each function** |

**When a migration adds an app-required table or function, add it to the manifest in the same batch.** The manifest is the contract between the deployed code and the database; if it drifts, the sentinel stops meaning anything.

## Reproducibility

`supabase/harness/replay.sh` replays the whole history against a disposable PostgreSQL 17 cluster in two modes — `empty` (clean rebuild) and `upgrade` (0188 absent, 0189 must reconstruct it). Both run in CI on every push. The pass condition is the catalog fingerprint agreeing with production across all fifteen measures, not the row counts; see `introspection/5_catalog_fingerprint.sql` in the remediation bundle and `POST_0189_VERIFICATION.md` for the expected values.

Two facts about production live outside this history and are reproduced by the harness shim rather than by a migration: Supabase's platform default privileges, and the fact that production runs PostgreSQL 17.6.
