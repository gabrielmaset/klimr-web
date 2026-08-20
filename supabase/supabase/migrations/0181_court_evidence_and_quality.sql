-- 0181_court_evidence_and_quality.sql — provenance records + data-quality scorecards
-- (audit DATA-003, COURT-005 normalized, PERF-002 measure · K2-06).
--
-- PART 1 — normalized evidence.
-- Today a verdict carries at most ONE source: `court_sport_intel.source`,
-- `.source_url`, `.evidence`, `.evidence_excerpt` (0175). That cannot express
-- what verification actually does — read several pages and weigh them — and it
-- cannot show an organizer disputing a verdict WHY Klimr concluded what it did.
-- This adds a proper one-verdict-to-many-evidence table. The denormalized
-- columns stay as the "headline" source so nothing breaks; new writes populate
-- both until the UI reads from here.
--
-- PART 2 — data-quality scorecards.
-- "AI-verified court data" is a claim in the investor materials
-- (CLAIMS-REGISTER.md). A claim needs a number behind it that anyone can
-- recompute. These functions expose four honest measures — coverage,
-- freshness, disagreement, and correction time — for courts intel and for
-- rankings, surfaced at /admin/data-quality.
--
-- NOT RISKY: one new table and two read-only functions. No existing row is
-- touched; the new table starts empty and fills as verifications run.
-- Backup not required.

-- ── Part 1: evidence records ───────────────────────────────────────────────
create table if not exists public.court_evidence (
  id               uuid primary key default gen_random_uuid(),
  place_id         text not null,
  sport            text not null,
  source_url       text,
  source_label     text,
  excerpt          text,
  supports_verdict text check (supports_verdict in ('confirmed', 'denied', 'unknown')),
  confidence       numeric,
  extractor_model  text,
  fetched_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

alter table public.court_evidence enable row level security;
revoke all on table public.court_evidence from anon, authenticated, public;

create index if not exists court_evidence_venue_idx
  on public.court_evidence (place_id, sport, fetched_at desc);

-- ── Part 2: courts intel scorecard ─────────────────────────────────────────
-- coverage_pct        share of intel rows that reached a definite verdict
--                     (confirmed/denied) rather than sitting at 'unknown'
-- median_age_days     freshness of the verdicts being served
-- stale_pct           share older than the 7-day freshness window
-- disagreement_pct    share of venues whose verdict CHANGED on re-check —
--                     the honest measure of how often the judge is unstable
-- evidence_per_verdict how many provenance records back a verdict on average
create or replace function public.court_data_quality()
returns table (
  total_verdicts        bigint,
  confirmed             bigint,
  denied                bigint,
  unknown               bigint,
  coverage_pct          numeric,
  median_age_days       numeric,
  stale_pct             numeric,
  disagreement_pct      numeric,
  evidence_per_verdict  numeric,
  verifying_now         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with i as (select * from public.court_sport_intel),
  agg as (
    select
      count(*)::bigint                                             as total_verdicts,
      count(*) filter (where verdict = 'confirmed')::bigint        as confirmed,
      count(*) filter (where verdict = 'denied')::bigint           as denied,
      count(*) filter (where verdict = 'unknown')::bigint          as unknown,
      count(*) filter (where verifying_at is not null)::bigint     as verifying_now,
      percentile_cont(0.5) within group (
        order by extract(epoch from (now() - checked_at)) / 86400.0
      )                                                            as median_age_days,
      count(*) filter (where checked_at < now() - interval '7 days')::bigint as stale_rows
    from i
  ),
  -- A venue with more than one DISTINCT verdict in its evidence trail has
  -- changed its mind at least once.
  dis as (
    select count(*)::bigint as flipped
    from (
      select place_id, sport
      from public.court_evidence
      where supports_verdict is not null
      group by place_id, sport
      having count(distinct supports_verdict) > 1
    ) f
  ),
  ev as (select count(*)::numeric as n from public.court_evidence)
  select
    agg.total_verdicts,
    agg.confirmed,
    agg.denied,
    agg.unknown,
    round(100.0 * (agg.confirmed + agg.denied) / nullif(agg.total_verdicts, 0), 1),
    round(agg.median_age_days::numeric, 1),
    round(100.0 * agg.stale_rows / nullif(agg.total_verdicts, 0), 1),
    round(100.0 * dis.flipped / nullif(agg.total_verdicts, 0), 1),
    round(ev.n / nullif(agg.total_verdicts, 0), 2),
    agg.verifying_now
  from agg, dis, ev;
$$;

-- ── Part 2b: rankings scorecard ────────────────────────────────────────────
-- Rankings feed the product's most load-bearing claim, so their freshness is
-- worth the same scrutiny as courts data.
create or replace function public.ranking_data_quality()
returns table (
  snapshot_days        bigint,
  latest_snapshot      date,
  hours_since_latest   numeric,
  players_in_latest    bigint,
  sports_covered       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (select max(snap_date) as d from public.rank_snapshots)
  select
    (select count(distinct snap_date) from public.rank_snapshots)::bigint,
    latest.d,
    round(extract(epoch from (now() - latest.d::timestamptz)) / 3600.0, 1),
    (select count(distinct user_id) from public.rank_snapshots r where r.snap_date = latest.d)::bigint,
    (select count(distinct sport_key) from public.rank_snapshots r where r.snap_date = latest.d)::bigint
  from latest;
$$;

revoke all on function public.court_data_quality() from anon, authenticated, public;
revoke all on function public.ranking_data_quality() from anon, authenticated, public;
