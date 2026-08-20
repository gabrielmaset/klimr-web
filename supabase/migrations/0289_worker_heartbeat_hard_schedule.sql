-- 0289_worker_heartbeat_hard_schedule.sql — the heartbeat gets scheduled, loudly.
--
-- WHAT HAPPENED. 0278 was pasted on 2026-08-17 (journal row exists) and scheduled
-- NOTHING: production's cron.job list carries eleven jobs and no worker-heartbeat.
-- 0278 guarded its config lookups with `raise notice ... return` — and NOTICEs are
-- invisible in the Supabase SQL editor, so the skip left no trace except a journal
-- row asserting success. That is the exact failure mode the 0283/0288 incident
-- taught us to ban one day later: a migration that can decline to do its job must
-- FAIL, not whisper. The observable cost: the storage-deletion drain, jobs worker,
-- perf pruning and health canaries have had no driver; the 13 seed-wipe storage
-- deletions sit pending with zero attempts.
--
-- WHAT THIS DOES. Re-attempts the identical schedule with hard-fail semantics:
--   * capability guards (pg_cron / pg_net absent) still skip quietly — that is the
--     harness, where skipping IS correct and the replay gate must stay green;
--   * missing deployment config (either GUC) RAISES, aborting the paste before the
--     journal row can claim success. The owner prepends two session-level SET
--     lines to the same paste (instructions in the exception text) — the values
--     are read once here and baked into the job command; nothing persists.
-- The job itself is byte-identical in intent to 0278's: every minute, POST to
-- <site_url>/api/cron/worker-heartbeat with the x-cron-secret header the route
-- validates against WAITLIST_CRON_SECRET. Re-pasting is safe: any existing
-- worker-heartbeat job is unscheduled first.

begin;

do $$
declare
  v_base   text;
  v_secret text;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '0289: cron.schedule unavailable — skipping (harness)';
    return;
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb)') is null then
    raise notice '0289: net.http_post unavailable — skipping (harness)';
    return;
  end if;

  begin
    v_base := current_setting('app.settings.site_url', true);
  exception when others then v_base := null; end;
  begin
    v_secret := current_setting('app.settings.waitlist_cron_secret', true);
  exception when others then v_secret := null; end;

  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    raise exception using
      message = '0289: deployment config missing — NOTHING SCHEDULED. '
        'Prepend these two lines to THIS SAME paste (session-level; Supabase''s '
        'postgres role cannot ALTER DATABASE SET, and persistence is not needed — '
        'the values are baked into the job command at paste time): '
        'set app.settings.site_url = ''https://klimr.com''; '
        'set app.settings.waitlist_cron_secret = ''<value of WAITLIST_CRON_SECRET from Vercel env>''; '
        'then run the combined paste again.',
      errcode = 'P0001';
  end if;

  begin
    perform cron.unschedule('worker-heartbeat');
  exception when others then null;  -- absent on first run; that is the expected state
  end;

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
      v_secret
    )
  );
  raise notice '0289: worker-heartbeat scheduled every minute against %', v_base;
end $$;

select public.journal_migration('0289', '0289_worker_heartbeat_hard_schedule.sql', null,
  'Reschedules the worker-heartbeat pg_cron job with hard-fail semantics: missing site_url or cron-secret GUCs abort the paste with instructions instead of a NOTICE-swallowed skip (which is how 0278 journaled success while scheduling nothing). Capability guards for the harness unchanged. Idempotent: unschedules any existing worker-heartbeat first.');

commit;
