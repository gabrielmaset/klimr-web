-- 0253_currency_and_cleanup_canaries.sql — makes the reconciliation something
-- that is WATCHED, not merely something that exists.
--
-- 0252 gave the points ledger a drift check and a rebuild procedure. Nothing ran
-- either of them. That is the difference between HAVING a control and RUNNING
-- one, and for a system the owner has designated as currency it is the whole
-- point: drift that nobody looks at is identical, from the member's side, to
-- having no reconciliation at all — the number on their profile is simply wrong
-- and stays wrong.
--
-- The same applies to 0243/0244's deletion outbox: intents that the worker never
-- performed are bytes we promised a member we had deleted and did not.
--
-- These are added to `klimr_health()` rather than to `klimr_readiness()` on
-- purpose. Readiness answers "is the schema shaped correctly" and must be true at
-- every deploy; health answers "did the work that should have happened, happen",
-- which is a runtime question about data. Putting a data-dependent check in the
-- boot gate would block a deploy over a condition a deploy cannot fix.

create or replace function public.klimr_health()
returns table (subsystem text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_n bigint; v_t timestamptz;
begin
  -- ── scheduled work ─────────────────────────────────────────────────────
  select count(*) into v_n from cron.job where active;
  subsystem := 'cron.jobs_scheduled';
  ok := v_n > 0;
  detail := v_n || ' active job(s): ' ||
            coalesce((select string_agg(jobname, ', ' order by jobname) from cron.job where active), 'none');
  return next;

  -- ── sessions past the hard cap ─────────────────────────────────────────
  select count(*) into v_n from public.court_sessions
   where status <> 'ended'
     and greatest(coalesce(activated_at, created_at), created_at) < now() - interval '13 hours';
  subsystem := 'queue.stale_sessions';
  ok := v_n = 0;
  detail := v_n || ' session(s) past the 12h cap';
  return next;

  -- ── outbox ─────────────────────────────────────────────────────────────
  -- The table is `social_outbox`. 0227 wrote `notification_outbox`, WHICH DOES
  -- NOT EXIST — and because plpgsql resolves table names at execution rather than
  -- creation, the migration applied cleanly and the function raised
  -- `relation "public.notification_outbox" does not exist` on every call since.
  --
  -- So `klimr_health()` — the thing built to detect silent failures — was itself
  -- a silent failure, and `klimr_healthy()` propagated the error rather than
  -- returning false. KRA-040 reports that nothing schedules or exports these
  -- canaries; the truth is worse, because they never ran at all. Found by CALLING
  -- it, which nothing in CI or the replay had ever done.
  select count(*) into v_n from public.social_outbox
   where delivered_at is null and created_at < now() - interval '15 minutes';
  subsystem := 'notifications.undelivered';
  ok := v_n = 0;
  detail := v_n || ' event(s) undelivered for over 15 minutes';
  return next;

  -- ── waitlist ───────────────────────────────────────────────────────────
  -- Likewise `waitlist_offers` does not exist; the table is `tournament_waitlist`
  -- and it has no expiry column, so the original assertion could not have been
  -- written against it. Asking the question the schema can actually answer: an
  -- entry notified long ago and still sitting in `waiting` means the promotion
  -- path stopped after the notification.
  select count(*) into v_n from public.tournament_waitlist
   where status = 'waiting' and notified_at is not null
     and notified_at < now() - interval '30 minutes';
  subsystem := 'waitlist.stalled_after_notice';
  ok := v_n = 0;
  detail := v_n || ' waitlist entr(ies) notified but never resolved';
  return next;

  -- ── POINTS: the projection must agree with the ledger ──────────────────
  -- Owner directive D-35: points are currency. A member whose profile shows the
  -- wrong total has been silently short-changed, and because the projection is
  -- derived, this is both detectable and fixable — `rebuild_all_player_points()`
  -- is the recovery. ANY drift is an incident: there is no tolerable amount of
  -- "the ledger and the balance disagree", so the threshold is zero and is not a
  -- judgement call.
  select public.points_drift_count() into v_n;
  subsystem := 'points.projection_drift';
  ok := v_n = 0;
  detail := v_n || ' player/sport projection(s) disagree with the ledger'
            || case when v_n > 0 then ' — run rebuild_all_player_points()' else '' end;
  return next;

  -- ── STORAGE: deletions we promised and did not perform ─────────────────
  select public.storage_deletions_stuck() into v_n;
  subsystem := 'storage.deletions_stuck';
  ok := v_n = 0;
  detail := v_n || ' object(s) awaiting deletion for over 6 hours';
  return next;

  select public.storage_deletions_abandoned() into v_n;
  subsystem := 'storage.deletions_abandoned';
  ok := v_n = 0;
  -- Separate from _stuck on purpose: these need a human, and folding them
  -- together would let the actionable number hide inside the tolerable one.
  detail := v_n || ' object(s) the worker gave up on — bytes we said were deleted';
  return next;

  -- ── errors ─────────────────────────────────────────────────────────────
  select count(*) into v_n from public.error_logs
   where level = 'error' and created_at > now() - interval '1 hour';
  subsystem := 'errors.last_hour';
  ok := v_n < 100;
  detail := v_n || ' error(s) in the last hour';
  return next;

  -- ── schema contract ────────────────────────────────────────────────────
  subsystem := 'schema.boundaries';
  ok := public.klimr_ready();
  detail := (select count(*)::text from public.klimr_readiness() where not passed) || ' boundary check(s) failing';
  return next;
end;
$$;

revoke all on function public.klimr_health() from public, anon, authenticated;
grant execute on function public.klimr_health() to service_role;

comment on function public.klimr_health is
  'KCDX-064 + D-35: canaries for work that should have happened and did not. Every silent failure this '
  'remediation found raised no exception, so there was nothing to alert on — these ask about ABSENCE. '
  'Includes points projection drift, because a currency system that reconciles but is not watched has '
  'a control it does not run.';

create or replace function public.health_canaries_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the currency check is wired in, and its threshold is zero
    (select position('points.projection_drift' in pg_get_functiondef(p.oid)) > 0
        and position('storage.deletions_abandoned' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'klimr_health' limit 1)
    and has_function_privilege('service_role', 'public.klimr_health()', 'EXECUTE')
    -- AND EVERY TABLE IT NAMES EXISTS, which is the actual defect class here.
    --
    -- My first version of this clause simply EXECUTED klimr_health(), reasoning
    -- that only running it proves it runs. That hung the replay: readiness
    -- discovers every *_intact() function, klimr_health() calls klimr_ready(),
    -- and klimr_ready() calls readiness again -- an infinite cycle through my own
    -- sentinel. A check that participates in the graph it checks cannot execute
    -- that graph.
    --
    -- to_regclass answers the same question without recursing. plpgsql resolves
    -- table names at EXECUTION, so a misspelled table applies cleanly and throws
    -- only when called, which is exactly how notification_outbox survived from
    -- 0227 until something finally called it. Execution is proven in the
    -- acceptance suite instead, from outside the graph.
    and to_regclass('public.social_outbox') is not null
    and to_regclass('public.tournament_waitlist') is not null
    and to_regclass('public.court_sessions') is not null
    and to_regclass('public.error_logs') is not null;
$$;

revoke all on function public.health_canaries_intact() from public, anon, authenticated;
grant execute on function public.health_canaries_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 33)
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
