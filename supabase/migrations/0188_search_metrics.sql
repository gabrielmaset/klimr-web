-- 0188_search_metrics.sql — first-class metrics for the search relevance decision
-- (audit SRCH-004 · K3-08).
--
-- WHY A SEPARATE MIGRATION. My first cut recorded search latency into the
-- `queue_action` bucket because that value was already in the enum. That would
-- have quietly corrupted the queue-action percentile — a budget the audit set
-- for the wedge's hot path — with numbers from an unrelated subsystem, and the
-- dashboard would have looked fine while measuring the wrong thing. Metrics
-- that mean different things get different names.
--
-- WHAT THE DECISION NEEDS. K3-08 was deferred until there is field data rather
-- than an opinion: whether to invest in Postgres FTS/trigram plus a reranker.
-- Three numbers decide it:
--   search_deterministic  latency of the current deterministic layer
--   search_zero           a search that returned NOTHING (value = latency)
--   search_ai             latency when the AI concierge path is used
-- Zero-result RATE falls out of count(search_zero) / count(search_deterministic).
--
-- Deliberately NOT stored: the query text. A search log is a behaviour log;
-- `perf_samples` is a latency histogram and must stay one (0186). Route carries
-- only a shape marker.

alter table public.perf_samples drop constraint if exists perf_samples_metric_check;

alter table public.perf_samples add constraint perf_samples_metric_check
  check (metric in (
    'lcp', 'inp', 'cls', 'ttfb',
    'queue_snapshot', 'queue_action',
    'court_search_stored', 'court_search_live',
    'search_deterministic', 'search_zero', 'search_ai'
  ));

-- Budgets for the new metrics, kept in the same place as every other budget.
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

-- The number the decision actually turns on: what share of searches find nothing.
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
    count(*) filter (where metric = 'search_deterministic')::bigint,
    count(*) filter (where metric = 'search_zero')::bigint,
    round(100.0 * count(*) filter (where metric = 'search_zero')
          / nullif(count(*) filter (where metric = 'search_deterministic'), 0), 1);
$$;

revoke all on function public.search_zero_rate(int) from anon, authenticated, public;
grant execute on function public.search_zero_rate(int) to service_role;
grant execute on function public.perf_report(int) to service_role;
