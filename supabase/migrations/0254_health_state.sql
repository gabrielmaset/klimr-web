-- 0254_health_state.sql — records health over time so something can alert on it,
-- and so an alert fires when a subsystem CHANGES rather than every minute.
--
-- KRA-040's remaining half. 0253 repaired `klimr_health()` — which had thrown on
-- every call since 0227 because it named two tables that do not exist — and
-- wired the points-drift and storage-deletion canaries into it. But a repaired
-- detector that nothing calls is the same defect one step along, and this
-- remediation has now found that shape four separate times (both cron routes,
-- the CSAM scanner, `withPrivileged`, and health itself). Repairing it without a
-- caller would have been the fifth.
--
-- ── WHY STATE, AND NOT JUST "ALERT WHEN NOT OK" ──────────────────────────
-- The tick runs every minute. A subsystem that stays unhealthy for a day would
-- produce 1,440 identical alerts, and the first thing anyone does with 1,440
-- identical alerts is silence the channel — taking the next real one with it.
-- That is the same "a canary that cries wolf gets muted" failure the design log
-- records, arriving through volume instead of through a bad threshold.
--
-- So the tick records state, and only a TRANSITION is worth telling someone
-- about: healthy → failing (something broke) and failing → healthy (it
-- recovered, which matters just as much when the alert was for lost points).

create table if not exists public.health_state (
  subsystem     text primary key,
  ok            boolean not null,
  detail        text,
  since         timestamptz not null default now(),
  last_checked  timestamptz not null default now()
);

alter table public.health_state enable row level security;
revoke all on public.health_state from anon, authenticated;
grant all on public.health_state to service_role;

comment on table public.health_state is
  'KRA-040: the last observed state of each canary, so the every-minute tick can alert on CHANGES. '
  '`since` is when the current state began — an outage''s age, which is the first thing anyone asks.';

-- ── record a snapshot, and report only what CHANGED ──────────────────────
create or replace function public.record_health_snapshot()
returns table (subsystem text, ok boolean, detail text, transitioned boolean)
language plpgsql
security definer
set search_path = public
as $$
-- The RETURNS TABLE columns are OUT parameters, so `subsystem` is both a plpgsql
-- variable and a column of health_state — and `on conflict (subsystem)` cannot
-- tell which, so the function raised "column reference is ambiguous" on every
-- call. Found by calling it, which is the same way the dead klimr_health() was
-- found one migration ago: a function that COMPILES is not a function that runs.
#variable_conflict use_column
begin
  return query
  with observed as (
    select h.subsystem, h.ok, h.detail from public.klimr_health() h
  ),
  upserted as (
    insert into public.health_state as s (subsystem, ok, detail, since, last_checked)
    select o.subsystem, o.ok, o.detail, now(), now() from observed o
    on conflict (subsystem) do update
      set ok           = excluded.ok,
          detail       = excluded.detail,
          -- `since` only moves when the state actually flips, so it measures how
          -- long this condition has held rather than how long ago we last looked.
          since        = case when s.ok is distinct from excluded.ok then now() else s.since end,
          last_checked = now()
    returning s.subsystem, s.ok, s.detail,
              (xmax <> 0 and s.since = now()) as flipped
  )
  select u.subsystem, u.ok, u.detail, u.flipped from upserted u;
end $$;

revoke all on function public.record_health_snapshot() from public, anon, authenticated;
grant execute on function public.record_health_snapshot() to service_role;

comment on function public.record_health_snapshot is
  'Runs every canary, stores the result, and flags which subsystems CHANGED state. The caller alerts '
  'on transitions only — 1,440 identical alerts a day is how a channel gets muted.';

-- ── how long has anything been failing ───────────────────────────────────
-- Deliberately NOT part of klimr_readiness(): that gate answers "is the schema
-- shaped correctly" and must be true at every deploy, while this is a runtime
-- fact about data that a deploy cannot fix. A boot gate that fails because points
-- drifted would block the very deploy carrying the repair.
create or replace function public.health_failing_since()
returns table (subsystem text, detail text, failing_for interval)
language sql
stable
security definer
set search_path = public
as $$
  select s.subsystem, s.detail, now() - s.since
    from public.health_state s
   where not s.ok
   order by s.since;
$$;

revoke all on function public.health_failing_since() from public, anon, authenticated;
grant execute on function public.health_failing_since() to service_role;

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.health_watcher_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the recorder exists and members cannot reach the state table
    to_regprocedure('public.record_health_snapshot()') is not null
    and not has_table_privilege('authenticated', 'public.health_state', 'SELECT')
    and not has_table_privilege('anon', 'public.health_state', 'SELECT')
    -- and `since` is a transition timestamp, not a heartbeat — otherwise
    -- "failing for 3 days" reads as "failing for 1 minute" forever
    and (select position('is distinct from excluded.ok' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'record_health_snapshot' limit 1);
$$;

revoke all on function public.health_watcher_intact() from public, anon, authenticated;
grant execute on function public.health_watcher_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 34)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
