-- 0278_worker_heartbeat_schedule.sql — H1: give the stranded workers a driver.
-- KFU-002 containment (NOT full closure — waitlist unification is the full
-- package). 0232 re-used the single 'waitlist-sweep' pg_cron job name for the
-- SQL sweep, which orphaned /api/cron/waitlist-sweep — the sole driver of the
-- Storage-deletion outbox, the jobs worker, perf pruning, and the health
-- canaries. Those have not run since 0232 deployed, and the health watcher that
-- would have alerted was itself on the dead route.
--
-- This schedules a NEW, separately-named job that pings the dedicated
-- worker-heartbeat endpoint (which does NOT sweep waitlists — running a second
-- waitlist engine beside 0232's SQL sweep would double-promote). Separate name
-- so it can never collide with or overwrite the waitlist-sweep schedule again.
--
-- Guarded for the harness where pg_cron/pg_net are absent, exactly as 0232/0173.

do $$
declare
  v_base text;
  v_secret text;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '0278: cron.schedule unavailable — skipping (harness)';
    return;
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb)') is null then
    raise notice '0278: net.http_post unavailable — skipping (harness)';
    return;
  end if;

  -- Resolve deployment config the same way 0173 did (GUCs set by the platform).
  begin
    v_base := current_setting('app.settings.site_url', true);
  exception when others then v_base := null; end;
  begin
    v_secret := current_setting('app.settings.waitlist_cron_secret', true);
  exception when others then v_secret := null; end;

  if v_base is null then
    raise notice '0278: app.settings.site_url unset — schedule not created; set it and re-run.';
    return;
  end if;

  perform cron.schedule(
    'worker-heartbeat',
    '* * * * *',
    format(
      $q$select net.http_post(
           url := %L,
           headers := jsonb_build_object('content-type','application/json','x-cron-secret',%L),
           body := '{}'::jsonb
         );$q$,
      v_base || '/api/cron/worker-heartbeat',
      coalesce(v_secret, '')
    )
  );
  raise notice '0278: worker-heartbeat scheduled every minute (separate from waitlist-sweep)';
end $$;

select public.journal_migration('0278', '0278_worker_heartbeat_schedule.sql', null,
  'H1 containment for KFU-002: a separately-named worker-heartbeat pg_cron job drives the Storage-deletion outbox, jobs worker, perf pruning and health canaries that 0232 orphaned by reusing the waitlist-sweep job name. Does not sweep waitlists; unification deferred to full KFU-002.');
