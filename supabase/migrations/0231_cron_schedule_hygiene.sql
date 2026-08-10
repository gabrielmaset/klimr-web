-- 0231_cron_schedule_hygiene.sql — two things found by reading the deployed
-- `cron.job` table rather than the migrations that wrote it.
--
-- ── (1) A THIRD GUARD VARIANT ────────────────────────────────────────────
-- 0227 corrected ten migrations whose cron scheduling was wrapped in
-- `exists (select 1 from pg_extension where extname = 'pg_cron')` — false in the
-- CI harness, so none of it ever ran there. 0157 uses a different form again,
-- `pg_available_extensions`, which the harness also cannot satisfy. So exactly
-- one job, `refresh-feed-affinities-nightly`, still schedules only in
-- production, where nothing verifies it. The replay says 10 active; production
-- has 11. A discrepancy that has an explanation is a discrepancy people stop
-- reading.
--
-- ── (2) NOTHING RUNS AT NIGHT ────────────────────────────────────────────
-- Every job below is named or intended as nightly maintenance. Converted to
-- America/Los_Angeles, where the members are:
--
--   listing-expiry      16:00 UTC → 09:00 local     credential-expiry 09:10
--   feed-prune          16:20 UTC → 09:20 local     rank-snapshots    09:30
--   error-log-prune     16:40 UTC → 09:40 local
--   purge-archived      03:30 UTC → 20:30 local     feed-affinities   21:15
--   purge-orphan-media  04:25 UTC → 21:25 local
--
-- Five run in a forty-minute block on weekday mornings, exactly when people
-- check courts before work, and three run during evening play. The likely cause
-- is reading 16:00 as an evening hour — UTC is not a timezone anybody lives in,
-- and "nightly" written in UTC is a guess about where the users are.
--
-- Moved into 02:00–05:00 local (09:00–12:00 UTC) and spaced so they do not
-- contend. The minute-level jobs and the hourly session sweep are left alone:
-- they are responsiveness, not maintenance.
--
-- Deliberately AFTER the 09:40 UTC Storage backup (RESILIENCE.md): a backup
-- should capture the day as it was, not the day after a purge ran through it.
--
-- ── HOW THIS REWRITES THEM, AND WHY NOT BY RETYPING ──────────────────────
-- My first draft retyped each job's command. Two of the eight function names I
-- wrote do not exist with those signatures — `purge_orphan_feed_media()` takes a
-- defaulted argument, and I invented `take_rank_snapshots()` outright. Those
-- jobs would have been rescheduled to a command that fails, every night, quietly:
-- the precise failure this remediation spent a week finding elsewhere, written
-- fresh by the person who had just finished writing about it.
--
-- So the command text is READ from the existing row and never retyped. Only the
-- schedule changes. A job that is not present is skipped rather than invented.
--
-- And the shim's `cron.schedule` INSERTs rather than upserts, so "rescheduling
-- by name is idempotent" is true of real pg_cron and false in CI — which showed
-- up as eighteen jobs where there should be eleven. Unschedule first, explicitly:
-- correct in both.

do $$
declare
  r record;
  v_cmd text;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;

  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '0231: cron.schedule unavailable — skipping schedule hygiene';
    return;
  end if;

  for r in
    select * from (values
      -- reads first, while what they summarise is still whole
      ('klimr-rank-snapshots',            '10 10 * * *'),
      ('refresh-feed-affinities-nightly', '25 10 * * *'),
      ('klimr-feed-prune',                '40 10 * * *'),
      -- then the deletions
      ('klimr-purge-orphan-media',        '10 11 * * *'),
      ('klimr-error-log-prune',           '25 11 * * *'),
      ('purge-archived-accounts',         '40 11 * * *')
    ) as t(jobname, sched)
  loop
    -- The command comes from the row that already exists. If the job is not
    -- there, leave it alone: a schedule for a job we cannot describe is worse
    -- than no schedule.
    select command into v_cmd from cron.job where jobname = r.jobname limit 1;
    if v_cmd is null then
      raise notice '0231: % not scheduled here — skipping', r.jobname;
      continue;
    end if;

    begin
      perform cron.unschedule(r.jobname);
    exception when others then null;
    end;
    perform cron.schedule(r.jobname, r.sched, v_cmd);
    raise notice '0231: % → %', r.jobname, r.sched;
  end loop;
end $$;
