-- 0227_health_canaries.sql — KCDX-064 (P2): observability misses failures and
-- several ingestion paths are empty.
--
-- Much of this finding closed with other work: Queue polling no longer swallows
-- fetch errors (0217), the middleware no longer blocks RUM/CSP/fleet ingestion
-- (KCDX-039), privileged commands carry a correlation id (0197), and the ledger
-- is reconciled. What is left is the part that matters most, and it is the part
-- this entire remediation kept demonstrating the need for:
--
--   · Both cron routes had never executed. Vercel reported healthy runs.
--   · Connection-request notifications had never been delivered — a constraint
--     rejected them and the insert error was discarded.
--   · Court sessions never expired; the fleet counted five-day-old queues.
--   · The Feed scope selector wrote a parameter the page did not read.
--
-- Every one of those is the same shape: something stops happening, nothing
-- throws, and no surface says so. You cannot alert on an exception that is never
-- raised. You CAN alert on work that should have happened and did not, which is
-- what a canary is — and none existed.
--
-- `klimr_health()` asks the questions whose answers only change when something
-- has silently stopped. It is deliberately about ABSENCE: not "did this error"
-- but "when did this last succeed, and is that too long ago".

-- ── a guard that tested the wrong thing ──────────────────────────────────
-- Every scheduled job in this schema was wrapped in
-- `if exists (select 1 from pg_extension where extname = 'pg_cron')`. That reads
-- as caution and behaves as a silent skip: the CI harness shims `cron.schedule`
-- as a plain function without the extension, so the guard was false there and
-- **not one migration's scheduling ever ran in CI**. The jobs existed only in
-- production, where nothing verified them — which is precisely how both HTTP
-- crons managed never to run for their entire lives.
--
-- The guards now test `to_regprocedure('cron.schedule(text,text,text)')` — the thing
-- about to be called, rather than a proxy for it. True in both environments, so
-- the replay exercises the same path production takes.

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
  -- Not "did the job error" but "is the job still scheduled at all". A cron
  -- entry that was unscheduled by a migration rollback disappears silently.
  -- Reports the count and the NAMES; asserts only that scheduling exists at all.
  -- My first version asserted `>= 4` — a number I cannot derive from anything,
  -- so it warned on a perfectly healthy database and would have been muted
  -- within a week. Whether a SPECIFIC job stopped is answered directly by the
  -- canaries below: sessions past the cap, undelivered outbox events, stale
  -- offers. Those are evidence of the effect, not a guess about the cause, and
  -- they cannot be wrong about a threshold.
  select count(*) into v_n from cron.job where active;
  subsystem := 'cron.jobs_scheduled';
  ok := v_n > 0;
  detail := v_n || ' active: ' || coalesce((select string_agg(jobname, ', ' order by jobname) from cron.job where active), 'none');
  return next;

  -- ── the outbox ─────────────────────────────────────────────────────────
  -- An event that committed with its graph edge and was never delivered. This
  -- is the exact failure KCDX-031 describes, and before the outbox existed
  -- there was no row to count.
  select count(*) into v_n from public.social_outbox
   where delivered_at is null and created_at < now() - interval '15 minutes';
  subsystem := 'social_outbox.undelivered';
  ok := v_n = 0;
  detail := v_n || ' event(s) older than 15 minutes';
  return next;

  -- ── session expiry ─────────────────────────────────────────────────────
  -- If the hourly sweep stops, this climbs. It is the number that would have
  -- shown the Live Fleet problem on day one rather than five days in.
  select count(*) into v_n from public.court_sessions
   where status <> 'ended' and created_at < now() - interval '14 hours';
  subsystem := 'queue.sessions_past_cap';
  ok := v_n = 0;
  detail := v_n || ' session(s) past the 12h cap (sweep runs hourly)';
  return next;

  -- ── the waitlist ───────────────────────────────────────────────────────
  select count(*) into v_n from public.join_requests
   where status = 'offered' and offer_expires_at < now() - interval '30 minutes';
  subsystem := 'waitlist.stale_offers';
  ok := v_n = 0;
  detail := v_n || ' offer(s) expired but not swept';
  return next;

  -- ── notification delivery ──────────────────────────────────────────────
  -- Silence here is ambiguous on a small product, so this reports rather than
  -- judges: a zero on a busy day means something, a zero on a quiet one does
  -- not, and a canary that cries wolf gets muted.
  select max(created_at) into v_t from public.notifications;
  subsystem := 'notifications.last_written';
  ok := true;
  detail := coalesce(to_char(v_t, 'YYYY-MM-DD HH24:MI'), 'never');
  return next;

  -- ── moderation queue ───────────────────────────────────────────────────
  select count(*) into v_n from public.posts
   where moderation_status = 'pending' and created_at < now() - interval '24 hours';
  subsystem := 'moderation.pending_over_24h';
  ok := v_n = 0;
  detail := v_n || ' post(s) awaiting review for over a day';
  return next;

  -- ── member reports ─────────────────────────────────────────────────────
  -- The SLA the audit asks for starts as a number somebody can see.
  select count(*) into v_n from public.post_reports
   where status = 'open' and created_at < now() - interval '24 hours';
  subsystem := 'reports.open_over_24h';
  ok := v_n = 0;
  detail := v_n || ' member report(s) open for over a day';
  return next;

  -- ── error volume ───────────────────────────────────────────────────────
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
  'KCDX-064: canaries for work that should have happened and did not. Every silent failure this '
  'remediation found — crons that never ran, notifications a constraint rejected, sessions that never '
  'expired — raised no exception, so there was nothing to alert on. These ask about ABSENCE instead.';

create or replace function public.klimr_healthy()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.klimr_health() where not ok);
$$;

revoke all on function public.klimr_healthy() from public, anon, authenticated;
grant execute on function public.klimr_healthy() to service_role;
