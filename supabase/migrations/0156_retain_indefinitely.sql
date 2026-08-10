-- 0156_retain_indefinitely.sql — retention reversal (Gabriel's decision,
-- 2026-07-30): Klimr RETAINS ALL activity content INDEFINITELY. The purge
-- machinery from 0155 is removed from the database entirely.
--
-- WHY (documented for GDPR Art. 5(1)(e) storage-limitation purposes): a
-- member's complete play history — matches, events, tournaments, classes —
-- is a core, permanent product feature ("your seasons"), the same legal
-- basis on which activity platforms retain full history. Account deletion
-- removes a member's data; nothing else does. Cost analysis on record:
-- tens of millions of archived rows ≈ single-digit GB ≈ ~$3/month.
--
-- This migration is safe whether or not 0155 was ever run (all guards are
-- if-exists). The date indexes from 0155 REMAIN — they serve the admin
-- archive explorer and the browse-surface upcoming filters, not purging.
-- 0155 stays in the migration ledger as history; shipped SQL is reversed
-- forward, never rewritten.

-- 1) The nightly job leaves the schedule (guarded: pg_cron may be absent,
--    the job may never have been scheduled).
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    if exists (select 1 from cron.job where jobname = 'purge-expired-content-daily') then
      perform cron.unschedule('purge-expired-content-daily');
    end if;
  end if;
end;
$$;

-- 2) The purge function leaves the database.
drop function if exists public.purge_expired_content(boolean);
