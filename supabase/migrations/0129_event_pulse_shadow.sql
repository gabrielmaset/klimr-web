-- 0129_event_pulse_shadow.sql — Event Pulse (liveness) shadow infrastructure:
-- feature flags, event occurrences, evidence tallies from queue truth,
-- the 3-strike series machine (SHADOW ONLY — no visibility changes), and audit.
-- Rule version 1. Occurrence math mirrors lib/event-schedule.ts exactly
-- (SU..SA day tokens, Sunday-anchored biweekly, same day-of-month monthly),
-- computed in America/Los_Angeles until events carry their own timezone.

-- ============ feature flags ============
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags for select to authenticated using (true);
grant select on public.feature_flags to authenticated;

insert into public.feature_flags (key, enabled, note) values
  ('event_liveness_shadow',        true,  'Compute occurrence closes + series transitions; write shadow columns only'),
  ('event_liveness_nudges',        false, 'Send watch/heartbeat notifications (phase: nudge-only)'),
  ('event_liveness_auto_dormancy', false, 'Apply dormancy to the REAL liveness_status (unlists from discovery)'),
  ('event_liveness_paused',        false, 'Outage circuit breaker: when true, liveness_run() is a no-op'),
  ('attendance_strip_public',      false, 'Show the verified-attendance strip on event pages'),
  ('business_publication',         false, 'Business accounts publish publicly'),
  ('business_tier2',               false, 'Tier-2 (sponsor-ready) capabilities'),
  ('sponsorship_discovery',        false, 'Sponsorship discovery surfaces'),
  ('sponsorship_payments',         false, 'Money movement (gated on the payments-phase liability decision)')
on conflict (key) do nothing;

-- ============ occurrences ============
create table if not exists public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  occ_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in
    ('scheduled','organizer_confirmed','skipped','cancelled','in_progress',
     'evidence_pending','completed_with_evidence','completed_empty','disputed')),
  verified_count integer not null default 0,
  evidence jsonb,
  skip_note text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, occ_date)
);
create index if not exists event_occurrences_close_idx on public.event_occurrences (status, ends_at);
create index if not exists event_occurrences_event_idx on public.event_occurrences (event_id, occ_date desc);
alter table public.event_occurrences enable row level security;
drop policy if exists event_occurrences_read on public.event_occurrences;
create policy event_occurrences_read on public.event_occurrences for select to authenticated using (true);
grant select on public.event_occurrences to authenticated;

-- ============ events liveness columns ============
alter table public.events
  add column if not exists liveness_status text not null default 'active'
    check (liveness_status in ('active','watch','dormant','archived')),
  add column if not exists liveness_shadow text not null default 'active'
    check (liveness_shadow in ('active','watch','dormant','archived')),
  add column if not exists empty_streak integer not null default 0,
  add column if not exists last_alive_at timestamptz,
  add column if not exists dormant_at timestamptz,
  add column if not exists organizer_state text not null default 'active'
    check (organizer_state in ('active','paused','ended')),
  add column if not exists paused_until timestamptz,
  add column if not exists liveness_rule_version integer not null default 1;

-- ============ transition audit ============
create table if not exists public.liveness_transitions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  occurrence_id uuid references public.event_occurrences(id) on delete set null,
  scope text not null check (scope in ('occurrence','series')),
  prev text not null,
  next text not null,
  reason_code text not null,
  shadow boolean not null default true,
  evidence jsonb,
  rule_version integer not null default 1,
  job_id text,
  created_at timestamptz not null default now()
);
create index if not exists liveness_transitions_event_idx on public.liveness_transitions (event_id, created_at desc);
create index if not exists liveness_transitions_recent_idx on public.liveness_transitions (created_at desc);
alter table public.liveness_transitions enable row level security;
-- no policies: service-role / admin client only

-- ============ the job ============
-- Set-based, idempotent, shadow-safe. Scope (rule v1): queue-enabled events only —
-- formats that do not use the queue are never judged by evidence they cannot produce.
create or replace function public.liveness_run(p_grace_hours integer default 18, p_job_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz constant text := 'America/Los_Angeles';
  v_now timestamptz := now();
  v_grace interval := make_interval(hours => greatest(1, least(48, p_grace_hours)));
  v_job text := coalesce(p_job_id, 'run:' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_generated int := 0; v_alive int := 0; v_empty int := 0; v_series int := 0;
  v_flag boolean;
begin
  -- circuit breaker
  select enabled into v_flag from feature_flags where key = 'event_liveness_paused';
  if coalesce(v_flag, false) then
    return jsonb_build_object('skipped', 'breaker', 'job', v_job);
  end if;
  select enabled into v_flag from feature_flags where key = 'event_liveness_shadow';
  if not coalesce(v_flag, false) then
    return jsonb_build_object('skipped', 'shadow_off', 'job', v_job);
  end if;

  -- ---- 1. generate due occurrences (window: 45 days back .. 1 day ahead) ----
  with elig as (
    select e.id, e.starts_at, e.ends_at, e.recurrence, e.recurrence_days,
           (e.starts_at at time zone v_tz) as start_local,
           greatest(interval '30 minutes',
                    least(interval '6 hours', coalesce(e.ends_at - e.starts_at, interval '2 hours'))) as dur
    from events e
    where e.queue_enabled = true
      and e.status = 'published'
      and e.cancelled_at is null
      and e.organizer_state <> 'ended'
      and e.recurrence in ('daily','weekly','biweekly','monthly','none')
  ),
  days as (
    select el.*, d::date as cursor
    from elig el
    cross join generate_series((v_now at time zone v_tz)::date - 45,
                               (v_now at time zone v_tz)::date + 1,
                               interval '1 day') as d
    where d::date >= el.start_local::date
  ),
  hits as (
    select id as event_id, cursor,
           ((cursor + (start_local::time)) at time zone v_tz) as occ_start, dur
    from days
    where case recurrence
      when 'none'    then cursor = start_local::date
      when 'daily'   then true
      when 'monthly' then extract(day from cursor) = extract(day from start_local)
      when 'weekly'  then
        (case when coalesce(array_length(recurrence_days,1),0) > 0
              then (array['SU','MO','TU','WE','TH','FR','SA'])[extract(dow from cursor)::int + 1] = any(recurrence_days)
              else extract(dow from cursor) = extract(dow from start_local) end)
      when 'biweekly' then
        (case when coalesce(array_length(recurrence_days,1),0) > 0
              then (array['SU','MO','TU','WE','TH','FR','SA'])[extract(dow from cursor)::int + 1] = any(recurrence_days)
              else extract(dow from cursor) = extract(dow from start_local) end)
        and (((cursor - extract(dow from cursor)::int)
              - (start_local::date - extract(dow from start_local)::int)) / 7) % 2 = 0
      else false end
  ),
  ins as (
    insert into event_occurrences (event_id, occ_date, starts_at, ends_at)
    select event_id, cursor, occ_start, occ_start + dur from hits
    on conflict (event_id, occ_date) do nothing
    returning 1
  )
  select count(*) into v_generated from ins;

  -- ---- 2. close occurrences past end + grace, tallying queue evidence ----
  create temp table _due on commit drop as
    select o.id, o.event_id, o.starts_at, o.ends_at
    from event_occurrences o
    where o.status in ('scheduled','organizer_confirmed','in_progress','evidence_pending')
      and o.ends_at + v_grace < v_now;

  create temp table _tally on commit drop as
    select d.id as occ_id,
           count(distinct coalesce('u:' || qtm.user_id::text, 'g:' || lower(qtm.guest_name))) as verified,
           count(distinct cs.id) as sessions,
           count(distinct qm.id) as matches
    from _due d
    left join court_sessions cs on cs.event_id = d.event_id
    left join queue_teams qt on qt.session_id = cs.id
    left join queue_team_members qtm on qtm.team_id = qt.id
      and qtm.joined_at >= d.starts_at - interval '2 hours'
      and qtm.joined_at <= d.ends_at + v_grace
    left join queue_matches qm on qm.session_id = cs.id
      and qm.started_at >= d.starts_at - interval '2 hours'
      and qm.started_at <= d.ends_at + v_grace
    group by d.id;

  with upd as (
    update event_occurrences o
    set status = case when t.verified > 0 then 'completed_with_evidence' else 'completed_empty' end,
        verified_count = t.verified,
        evidence = jsonb_build_object('participants', t.verified, 'sessions', t.sessions,
                                      'matches', t.matches, 'grace_hours', p_grace_hours),
        closed_at = v_now
    from _tally t
    where o.id = t.occ_id
    returning o.id, o.event_id, o.status
  ),
  aud as (
    insert into liveness_transitions (event_id, occurrence_id, scope, prev, next, reason_code, shadow, evidence, job_id)
    select u.event_id, u.id, 'occurrence', 'scheduled', u.status,
           case when u.status = 'completed_with_evidence' then 'evidence_found' else 'no_evidence' end,
           true, null, v_job
    from upd u
    returning (select status from event_occurrences where id = occurrence_id) as st
  )
  select count(*) filter (where st = 'completed_with_evidence'),
         count(*) filter (where st = 'completed_empty')
    into v_alive, v_empty from aud;

  -- ---- 3. series machine (SHADOW): 3 strikes, cadence-aware, new-series exempt ----
  with stats as (
    select e.id, e.recurrence, e.liveness_shadow, e.organizer_state, e.paused_until,
           s.total_closed, s.streak, s.last_alive
    from events e
    join lateral (
      select count(*) as total_closed,
             coalesce(min(rn) filter (where c.status = 'completed_with_evidence') - 1,
                      count(*))::int as streak,
             max(c.ends_at) filter (where c.status = 'completed_with_evidence') as last_alive
      from (
        select o.status, o.ends_at,
               row_number() over (order by o.occ_date desc) as rn
        from event_occurrences o
        where o.event_id = e.id
          and o.status in ('completed_with_evidence','completed_empty')
      ) c
    ) s on true
    where e.queue_enabled = true
      and e.recurrence in ('daily','weekly','biweekly','monthly')
      and s.total_closed > 0
  ),
  target as (
    select st.id, st.liveness_shadow as prev, st.streak, st.last_alive,
      case
        when st.organizer_state = 'paused' and coalesce(st.paused_until, v_now) > v_now then st.liveness_shadow
        when st.streak = 0 then 'active'
        when st.total_closed <= 2 then 'active'   -- first two occurrences exempt
        when st.streak >= 3
             and (st.recurrence <> 'monthly'
                  or coalesce(v_now - st.last_alive, interval '999 days') >= interval '75 days')
          then 'dormant'
        else 'watch'
      end as next
    from stats st
  ),
  chg as (
    update events e
    set liveness_shadow = t.next,
        empty_streak = t.streak,
        last_alive_at = t.last_alive,
        dormant_at = case when t.next = 'dormant' and t.prev <> 'dormant' then v_now
                          when t.next <> 'dormant' then null else e.dormant_at end
    from target t
    where e.id = t.id
      and (e.liveness_shadow <> t.next or e.empty_streak <> t.streak
           or e.last_alive_at is distinct from t.last_alive)
    returning e.id, t.prev, t.next, t.streak
  ),
  aud2 as (
    insert into liveness_transitions (event_id, scope, prev, next, reason_code, shadow, evidence, job_id)
    select c.id, 'series', c.prev, c.next,
           case when c.next = 'dormant' then 'three_strikes'
                when c.next = 'watch' then 'empty_streak'
                else 'evidence_resumed' end,
           true, jsonb_build_object('streak', c.streak), v_job
    from chg c where c.prev <> c.next
    returning 1
  )
  select count(*) into v_series from aud2;

  return jsonb_build_object('job', v_job, 'generated', v_generated,
    'closed_with_evidence', v_alive, 'closed_empty', v_empty, 'series_changed', v_series);
end;
$$;

revoke all on function public.liveness_run(integer, text) from public, anon, authenticated;
grant execute on function public.liveness_run(integer, text) to service_role;

-- Scheduling: on Supabase Pro enable pg_cron and run hourly:
--   select cron.schedule('liveness-hourly', '17 * * * *', $$select public.liveness_run();$$);
-- Until then, Admin → Liveness has a Run-now button (service role).
