-- 0189_schema_reconciliation.sql — KCDX-004 forward repair
--
-- STATUS: STAGED. Paste only after the Batch-B schema snapshot (introspection
-- file 1) confirms archived schema == production schema. Every statement is
-- idempotent and no-ops where production already matches, so it is safe in
-- either state. Revised 2026-08-07 after production introspection.
--
-- Repairs two defects proven by the 188-migration empty replay
-- (docs/KCDX-004_replay_evidence.md):
--
-- F1  profiles.avatar_path — read by 0099's people_you_may_know, declared in
--     lib/database.types.ts, consumed by 36 app files, but added by NO
--     migration. It exists in production (out-of-band change), so this is a
--     no-op there; it repairs the ordered history for any clean rebuild.
--
-- F2  0188's repo copy omits `from s`, so unqualified `metric`
--     cannot resolve. The repo copy of 0188 therefore CANNOT create the function
--     in any environment where Postgres validates function bodies (proven: the
--     empty replay fails there). Production introspection nonetheless shows the
--     function present, along with 0188's constraint and perf_report budgets —
--     so 0188 did apply. Either a corrected version was pasted and never
--     returned to the repo, or the body-check was relaxed and production holds
--     a function that errors when called. `create or replace` below is correct
--     in both cases: it is a no-op against a already-correct body and a repair
--     against a broken one. File 4 of the introspection set decides which.
--
--     Retracted from the previous draft: the claim that all of 0188 rolled back,
--     and with it that search telemetry was being silently discarded. The
--     constraint accepts the search metrics in production; zero recorded samples
--     is explained by pre-launch traffic and 10% sampling.

-- ── F1 · out-of-band production object, recorded in the history ─────────────
alter table public.profiles add column if not exists avatar_path text;

-- ── F2a · metric vocabulary (idempotent; production already matches) ───────
alter table public.perf_samples drop constraint if exists perf_samples_metric_check;

alter table public.perf_samples add constraint perf_samples_metric_check
  check (metric in (
    'lcp', 'inp', 'cls', 'ttfb',
    'queue_snapshot', 'queue_action',
    'court_search_stored', 'court_search_live',
    'search_deterministic', 'search_zero', 'search_ai'
  ));

-- ── F2b · perf_report — 0188's text (production is identical modulo CRLF) ──
create or replace function public.perf_report(p_hours int default 24)
returns table (
  metric      text,
  budget_ms   numeric,
  samples     bigint,
  p50_ms      numeric,
  p95_ms      numeric,
  worst_ms    numeric,
  within_budget boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with budgets(metric, budget_ms) as (
    values
      ('queue_snapshot',       300::numeric),
      ('queue_action',         800::numeric),
      ('court_search_stored', 1500::numeric),
      ('court_search_live',   6000::numeric),
      ('search_deterministic', 400::numeric),  -- typing-speed search must feel instant
      ('search_zero',          400::numeric),  -- a miss must be fast too
      ('search_ai',           4000::numeric),  -- concierge path does model work
      ('lcp',                 2500::numeric),
      ('inp',                  200::numeric),
      ('ttfb',                 800::numeric),
      ('cls',                  100::numeric)
  ),
  s as (
    select metric, value_ms
      from public.perf_samples
     where created_at > now() - make_interval(hours => greatest(p_hours, 1))
  )
  select
    b.metric, b.budget_ms,
    count(s.value_ms)::bigint,
    round(percentile_cont(0.5)  within group (order by s.value_ms)::numeric, 1),
    round(percentile_cont(0.95) within group (order by s.value_ms)::numeric, 1),
    round(max(s.value_ms)::numeric, 1),
    case when count(s.value_ms) = 0 then null
         else percentile_cont(0.95) within group (order by s.value_ms) <= b.budget_ms end
  from budgets b
  left join s on s.metric = b.metric
  group by b.metric, b.budget_ms
  order by b.metric;
$$;

-- ── F2c · search_zero_rate — PRODUCTION's corrected text, adopted verbatim ──
-- Retrieved via pg_get_functiondef. It qualifies every `metric` as `s.metric`
-- and adds the missing `from s`; that is a better fix than adding the FROM
-- alone, so the repository converges on the deployed version rather than the
-- reverse. Line endings normalised to LF.
create or replace function public.search_zero_rate(p_hours int default 168)
returns table (searches bigint, zero_results bigint, zero_pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select metric from public.perf_samples
     where created_at > now() - make_interval(hours => greatest(p_hours, 1))
       and metric in ('search_deterministic', 'search_zero')
  )
  select
    count(*) filter (where s.metric = 'search_deterministic')::bigint,
    count(*) filter (where s.metric = 'search_zero')::bigint,
    round(100.0 * count(*) filter (where s.metric = 'search_zero')
          / nullif(count(*) filter (where s.metric = 'search_deterministic'), 0), 1)
  from s;
$$;

revoke all on function public.search_zero_rate(int) from anon, authenticated, public;
grant execute on function public.search_zero_rate(int) to service_role;
grant execute on function public.perf_report(int) to service_role;

-- ── F4 · avatars bucket limits — present in production, set by NO migration ─
update storage.buckets
   set file_size_limit = 6291456,
       allowed_mime_types = array['image/webp','image/jpeg','image/png']
 where id = 'avatars'
   and (file_size_limit is distinct from 6291456
        or allowed_mime_types is distinct from array['image/webp','image/jpeg','image/png']);

-- ── F5 · drop four duplicate `avatars` Storage policies ────────────────────
-- Created outside the migrations (Supabase dashboard naming). Each duplicates a
-- migration-created policy with an identical expression; both sets are
-- PERMISSIVE, so removing them changes no privilege — it removes redundant
-- per-object policy evaluation and a pair of objects the history cannot rebuild.
drop policy if exists "avatars: owner insert" on storage.objects;
drop policy if exists "avatars: owner update" on storage.objects;
drop policy if exists "avatars: owner delete" on storage.objects;
drop policy if exists "avatars: public read"  on storage.objects;

-- ── F6 · anon holds no DML — enforced in production, in no migration ───────
-- Production's grant catalog reproduces EXACTLY once two environmental facts
-- are applied: Supabase's platform default privileges (`grant all on tables` to
-- anon/authenticated/service_role, which the hosted project sets and no Klimr
-- migration contains), and a schema-wide revoke of INSERT/UPDATE/DELETE from
-- `anon`. The revoke exists nowhere in 0001-0188 — someone applied it by hand.
--
-- It is protective, and it is the single largest thing standing between a clean
-- rebuild and an `anon` role holding write privileges on ~100 tables with only
-- RLS behind it. Recorded here so the history reproduces it, and extended to
-- the default privileges so tables created by FUTURE migrations do not silently
-- regain DML for anon. This is reconciliation of what production already does,
-- not a new policy decision; the narrower per-table grant work is KCDX-016.
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete on tables from anon;
