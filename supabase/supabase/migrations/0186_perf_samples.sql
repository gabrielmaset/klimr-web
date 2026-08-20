-- 0186_perf_samples.sql — real-user monitoring for the performance budgets
-- (audit PERF-001/PERF-003 · K3-05).
--
-- WHY. `docs/PERFORMANCE.md` diagnosed the July responsiveness problems and
-- shipped fixes, but nothing measures whether they held or whether the budgets
-- are met in the field. The audit's targets — stored court ≤ 1.5 s, queue
-- snapshot p95 ≤ 300 ms, queue action p95 ≤ 800 ms — are unfalsifiable without
-- real-user data, and a budget nobody can check is a wish.
--
-- SHAPE. Raw samples with a SHORT retention, because percentiles cannot be
-- computed from pre-aggregated averages. One narrow row per sample, no user id
-- and no URL query strings: this is a latency histogram, not analytics, and it
-- must not quietly become a behaviour log. Metrics are a closed enum so the
-- table cannot become a dumping ground.
--
-- VOLUME. Client beacons are sampled at 10% (see app/api/rum), so 1,000 daily
-- players generate a few thousand rows/day. `prune_perf_samples()` keeps 14
-- days, which is enough to see a regression and short enough that the table
-- stays small.
--
-- NOT RISKY: one new table and two functions. Nothing existing is touched.
-- Backup not required.

create table if not exists public.perf_samples (
  id          bigserial primary key,
  metric      text not null check (metric in (
                'lcp', 'inp', 'cls', 'ttfb',            -- Core Web Vitals
                'queue_snapshot', 'queue_action',        -- the wedge's hot paths
                'court_search_stored', 'court_search_live'
              )),
  value_ms    numeric not null check (value_ms >= 0),
  route       text,                                     -- pattern, never a real URL
  is_mobile   boolean,
  created_at  timestamptz not null default now()
);

alter table public.perf_samples enable row level security;
revoke all on table public.perf_samples from anon, authenticated, public;

create index if not exists perf_samples_metric_time_idx
  on public.perf_samples (metric, created_at desc);

-- ── Percentiles against the budgets ────────────────────────────────────────
-- Budgets live HERE, next to the measurement, so the dashboard cannot drift
-- from the numbers the audit actually set.
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
      ('queue_snapshot',      300::numeric),   -- audit target, p95
      ('queue_action',        800::numeric),   -- audit target, p95
      ('court_search_stored', 1500::numeric),  -- audit target
      ('court_search_live',   6000::numeric),  -- live path does network + model work
      ('lcp',                 2500::numeric),  -- Core Web Vitals "good"
      ('inp',                 200::numeric),
      ('ttfb',                800::numeric),
      ('cls',                 100::numeric)    -- stored ×1000 to stay in one numeric column
  ),
  s as (
    select metric, value_ms
      from public.perf_samples
     where created_at > now() - make_interval(hours => greatest(p_hours, 1))
  )
  select
    b.metric,
    b.budget_ms,
    count(s.value_ms)::bigint,
    round(percentile_cont(0.5)  within group (order by s.value_ms)::numeric, 1),
    round(percentile_cont(0.95) within group (order by s.value_ms)::numeric, 1),
    round(max(s.value_ms)::numeric, 1),
    -- No samples ⇒ NULL, not "passing": an empty budget is unknown, not met.
    case when count(s.value_ms) = 0 then null
         else percentile_cont(0.95) within group (order by s.value_ms) <= b.budget_ms end
  from budgets b
  left join s on s.metric = b.metric
  group by b.metric, b.budget_ms
  order by b.metric;
$$;

-- Retention: 14 days. Called from the minute cron alongside the jobs drain.
create or replace function public.prune_perf_samples() returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  delete from public.perf_samples where created_at < now() - interval '14 days';
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.perf_report(int) from anon, authenticated, public;
revoke all on function public.prune_perf_samples() from anon, authenticated, public;
grant execute on function public.perf_report(int) to service_role;
grant execute on function public.prune_perf_samples() to service_role;
grant select, insert, delete on table public.perf_samples to service_role;
grant usage, select on sequence public.perf_samples_id_seq to service_role;
