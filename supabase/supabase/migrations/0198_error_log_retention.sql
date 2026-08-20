-- 0198_error_log_retention.sql — KCDX-068 (P2): error telemetry is scrubbed at
-- write time, but nothing ever removed it.
--
-- The scrubber (lib/log-scrub.ts) is the first half: templates instead of paths,
-- stable pseudonyms instead of ids, secrets redacted. This is the second half
-- the finding also asks for — "bound size/retention/access".
--
-- ACCESS is already correct and worth stating rather than assuming: `error_logs`
-- has RLS enabled with no policy at all, so `authenticated` is default-denied,
-- and 0196 removed the `anon` SELECT grant. Only the service role reads it.
--
-- RETENTION is 30 days. A debugging log is useful for about a sprint; after that
-- it is a growing pile of pseudonymised rows with no reader. Thirty days also
-- keeps the table comfortably inside the 500 MB the database budget assumes.
--
-- Deliberately NOT cascading to `admin_actions`: that is an audit trail, not
-- telemetry, and the retention question there is a compliance decision rather
-- than a housekeeping one.

create or replace function public.prune_error_logs()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  delete from public.error_logs where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.prune_error_logs() from public, anon, authenticated;
grant execute on function public.prune_error_logs() to service_role;

comment on function public.prune_error_logs is
  'KCDX-068: 30-day retention for scrubbed error telemetry. Scheduled nightly; safe to call by hand.';

-- Nightly, alongside the other prunes.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.unschedule('klimr-error-log-prune');
  end if;
exception when others then
  null;  -- not scheduled yet, or pg_cron absent off-platform
end $$;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('klimr-error-log-prune', '40 16 * * *', 'select public.prune_error_logs()');
  end if;
end $$;
