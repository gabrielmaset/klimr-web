# KCDX-004 replay gate (CI-portable)

Reproduces the migration-reconciliation proof. Requires PostgreSQL 16 and an unprivileged user.

```bash
./replay.sh empty      # clean-rebuild proof: 0001→0188 + 0189 from nothing
./replay.sh upgrade    # production-baseline proof: 0188 absent (it rolled back), 0189 repairs
```

Both must converge on the same schema — **118 tables (all RLS), 212 functions, 237 policies, 9 buckets** — with `upgrade` at zero failures and `empty` failing only on `0188` itself, which `0189` repairs. Four acceptance probes must pass in both: `profiles.avatar_path` present, `search_zero_rate` present, `search_zero_rate` callable, and a `search_zero` sample accepted by the metric constraint.

**Order matters.** `shim.sql` → `0001_init` → `baseline_repair.sql` → `seed.sql` → `0002…0188` → `0189`. The seed must precede `0016/0017/0018` (they carry `sport_key` foreign keys) and `baseline_repair.sql` must precede `0099` (it reads `profiles.avatar_path`, which no migration creates).

**Files.** `shim.sql` gives Supabase parity off-platform, including the hosted project's schema-wide **default privileges** (`grant all on tables to anon, authenticated, service_role`) — without them the replayed grant catalog diverges from production for every table created after migration 0043, which is a harness gap, not a Klimr defect. It also provides: roles `anon`/`authenticated`/`service_role`/`authenticator`, the `auth`/`storage`/`extensions`/`cron`/`net` schemas, `auth.uid()/role()/jwt()`, a minimal `auth.users`, `storage.buckets`/`objects`, a `cron.job` capture table, a `net.http_post` stub, and the default `supabase_realtime` publication. `baseline_repair.sql` carries objects that exist in production but no migration creates — every entry is a KCDX-004 drift record.

**Environment limitation.** `create extension pg_cron/pg_net` lines are neutralized in replay *copies*; repo files are never touched. This is Tier 1 — it proves catalog state, ordering, and replayability. It does **not** prove behaviour at the real PostgREST/Storage/Realtime boundary; that is Tier 2, against a disposable Supabase project with real anon/member/organizer/admin/service clients.

**CI.** Wire both gates into GitHub Actions on a `postgres:16` service container. Add the disposable Supabase project's URL and keys as repo secrets for the Tier-2 negative suites (KCDX-018, KCDX-051, KCDX-052).

**Catalog diff.** After either gate, run the fingerprint query (`introspection/5_catalog_fingerprint.sql`) against the replay and against the target database; fifteen measures must agree. That comparison is the actual pass condition — the table/function counts above are only a quick smoke check.
