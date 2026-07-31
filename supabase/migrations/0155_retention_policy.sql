-- 0155_retention_policy.sql — AUTOMATIC expired-content retention (v2 per
-- Gabriel: no admin purge capability — purging is scheduled policy, not a
-- human action).
--
-- LEGAL BASIS (researched 2026-07-30): GDPR Art. 5(1)(e) and the CCPA set NO
-- minimum retention for activity content — they impose storage LIMITATION
-- (keep no longer than necessary, document the schedule). Fixed minimums
-- exist for financial/tax records: 5–7 years.
--
-- THE SCHEDULE — runs AUTOMATICALLY, nightly:
--   • 24 MONTHS after their date: matches (non-recurring), events, class
--     sessions, and tournaments WITHOUT payment records — deleted with all
--     child rows.
--   • 7 YEARS: tournaments WITH payment records (tax-document class) — then
--     deleted automatically as well.
--   • Recurring match templates and unscheduled matches are never purged.
--
-- MECHANICS: purge_expired_content(p_dry_run default TRUE) remains
-- service_role-only; the Admin page calls it dry for INFORMATIONAL counts
-- only — there is no manual purge trigger anywhere. A pg_cron job runs the
-- real purge nightly at 03:30 UTC; if pg_cron is unavailable the migration
-- still succeeds and raises a NOTICE. Idempotent.

create index if not exists matches_scheduled_at_idx on public.matches (scheduled_at);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists tournaments_starts_at_idx on public.tournaments (starts_at);
create index if not exists class_sessions_starts_at_idx on public.class_sessions (starts_at);

create or replace function public.purge_expired_content(p_dry_run boolean default true)
returns table (kind text, eligible bigint, deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut timestamptz := now() - interval '24 months';
  v_tax_cut timestamptz := now() - interval '7 years';
  n bigint;
begin
  -- ── matches (24 months; recurring templates exempt) ──
  select count(*) into eligible from public.matches m
    where m.recurring = false and m.scheduled_at is not null and m.scheduled_at < v_cut;
  kind := 'matches'; deleted := 0;
  if not p_dry_run and eligible > 0 then
    delete from public.match_invites mi using public.matches m
      where mi.match_id = m.id and m.recurring = false and m.scheduled_at < v_cut;
    delete from public.match_participants mp using public.matches m
      where mp.match_id = m.id and m.recurring = false and m.scheduled_at < v_cut;
    delete from public.matches m
      where m.recurring = false and m.scheduled_at is not null and m.scheduled_at < v_cut;
    get diagnostics n = row_count; deleted := n;
  end if;
  return next;

  -- ── events (24 months) ──
  select count(*) into eligible from public.events e
    where e.starts_at is not null and e.starts_at < v_cut;
  kind := 'events'; deleted := 0;
  if not p_dry_run and eligible > 0 then
    delete from public.event_rsvps r using public.events e where r.event_id = e.id and e.starts_at < v_cut;
    delete from public.event_occurrences o using public.events e where o.event_id = e.id and e.starts_at < v_cut;
    delete from public.event_managers g using public.events e where g.event_id = e.id and e.starts_at < v_cut;
    delete from public.events e where e.starts_at is not null and e.starts_at < v_cut;
    get diagnostics n = row_count; deleted := n;
  end if;
  return next;

  -- ── class sessions (24 months) ──
  select count(*) into eligible from public.class_sessions s where s.starts_at < v_cut;
  kind := 'class_sessions'; deleted := 0;
  if not p_dry_run and eligible > 0 then
    delete from public.class_enrollments en using public.class_sessions s
      where en.session_id = s.id and s.starts_at < v_cut;
    delete from public.class_sessions s where s.starts_at < v_cut;
    get diagnostics n = row_count; deleted := n;
  end if;
  return next;

  -- ── tournaments WITHOUT payments (24 months) + WITH payments (7 years) ──
  -- One shared child-cleanup path; eligibility differs by payment linkage.
  select count(*) into eligible from public.tournaments t
    where (t.starts_at < v_cut and not exists (select 1 from public.tournament_payments p where p.tournament_id = t.id))
       or (t.starts_at < v_tax_cut);
  kind := 'tournaments'; deleted := 0;
  if not p_dry_run and eligible > 0 then
    create temp table _purge_tids on commit drop as
      select t.id from public.tournaments t
      where (t.starts_at < v_cut and not exists (select 1 from public.tournament_payments p where p.tournament_id = t.id))
         or (t.starts_at < v_tax_cut);
    delete from public.tournament_registration_players x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_registrations x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_waitlist x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_group_entries ge
      using public.tournament_groups g
      where ge.group_id = g.id and g.tournament_id in (select id from _purge_tids);
    delete from public.tournament_groups x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_matches x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_draws x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_divisions x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_points x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_plan_items x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_custom_fields x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_managers x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournament_payments x where x.tournament_id in (select id from _purge_tids);
    delete from public.tournaments t where t.id in (select id from _purge_tids);
    get diagnostics n = row_count; deleted := n;
    drop table if exists _purge_tids;
  end if;
  return next;
end;
$$;

revoke all on function public.purge_expired_content(boolean) from public;
revoke all on function public.purge_expired_content(boolean) from authenticated;
grant execute on function public.purge_expired_content(boolean) to service_role;

-- ── the automation: nightly at 03:30 UTC via pg_cron ──
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'purge-expired-content-daily',
      '30 3 * * *',
      'select public.purge_expired_content(false)'
    );
  else
    raise notice 'pg_cron unavailable on this instance — enable it in Supabase (Database → Extensions) and re-run this migration to activate the nightly purge.';
  end if;
end;
$$;
