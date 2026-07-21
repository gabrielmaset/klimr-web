-- 0130_liveness_organizer_tools.sql — Event Pulse organizer controls (skip a date,
-- pause-until, resume, end series) as SECURITY DEFINER RPCs, plus liveness_run v2:
-- auto-unpause when paused_until passes, pause-window occurrences close as SKIPPED
-- (never empty — a planned pause is not a ghost), and ended-series stragglers cancel.
-- Adds `actor` to the transition audit so organizer intents are attributable.

alter table public.liveness_transitions add column if not exists actor uuid;

-- organizer check shared by every RPC
create or replace function public._liveness_is_organizer(p_event uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e where e.id = p_event and e.created_by = p_uid
    union all
    select 1 from event_managers m where m.event_id = p_event and m.user_id = p_uid
  );
$$;
revoke all on function public._liveness_is_organizer(uuid, uuid) from public, anon, authenticated;

-- occurrence start/end for an arbitrary date, mirroring the generator (rule v1, LA tz)
create or replace function public._liveness_occ_bounds(p_event uuid, p_date date,
  out o_start timestamptz, out o_end timestamptz)
language sql stable security definer set search_path = public as $$
  select ((p_date + (e.starts_at at time zone 'America/Los_Angeles')::time)
            at time zone 'America/Los_Angeles') as o_start,
         ((p_date + (e.starts_at at time zone 'America/Los_Angeles')::time)
            at time zone 'America/Los_Angeles')
           + greatest(interval '30 minutes',
                      least(interval '6 hours', coalesce(e.ends_at - e.starts_at, interval '2 hours'))) as o_end
  from events e where e.id = p_event;
$$;
revoke all on function public._liveness_occ_bounds(uuid, date) from public, anon, authenticated;

-- ---- skip a single date ----
create or replace function public.liveness_skip_occurrence(p_event uuid, p_date date, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prev text; v_id uuid; b record;
begin
  if v_uid is null or not _liveness_is_organizer(p_event, v_uid) then
    return jsonb_build_object('error', 'not_organizer');
  end if;
  select status into v_prev from event_occurrences
  where event_id = p_event and occ_date = p_date;
  if v_prev in ('completed_with_evidence','completed_empty','cancelled','disputed') then
    return jsonb_build_object('error', 'already_closed', 'status', v_prev);
  end if;
  if p_date < (now() at time zone 'America/Los_Angeles')::date - 1 then
    return jsonb_build_object('error', 'date_past');
  end if;
  select * into b from _liveness_occ_bounds(p_event, p_date);
  insert into event_occurrences (event_id, occ_date, starts_at, ends_at, status, skip_note)
  values (p_event, p_date, b.o_start, b.o_end, 'skipped', nullif(left(coalesce(p_note, ''), 140), ''))
  on conflict (event_id, occ_date) do update
    set status = 'skipped', skip_note = nullif(left(coalesce(p_note, ''), 140), '')
  returning id into v_id;
  insert into liveness_transitions (event_id, occurrence_id, scope, prev, next, reason_code, shadow, actor)
  values (p_event, v_id, 'occurrence', coalesce(v_prev, 'scheduled'), 'skipped', 'organizer_skip', false, v_uid);
  return jsonb_build_object('ok', true);
end; $$;

-- ---- un-skip ----
create or replace function public.liveness_unskip_occurrence(p_event uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null or not _liveness_is_organizer(p_event, v_uid) then
    return jsonb_build_object('error', 'not_organizer');
  end if;
  update event_occurrences set status = 'scheduled', skip_note = null, closed_at = null
  where event_id = p_event and occ_date = p_date and status = 'skipped'
  returning id into v_id;
  if v_id is null then return jsonb_build_object('error', 'not_skipped'); end if;
  insert into liveness_transitions (event_id, occurrence_id, scope, prev, next, reason_code, shadow, actor)
  values (p_event, v_id, 'occurrence', 'skipped', 'scheduled', 'organizer_unskip', false, v_uid);
  return jsonb_build_object('ok', true);
end; $$;

-- ---- pause the series until a date ----
create or replace function public.liveness_pause_series(p_event uuid, p_until timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prev text;
begin
  if v_uid is null or not _liveness_is_organizer(p_event, v_uid) then
    return jsonb_build_object('error', 'not_organizer');
  end if;
  if p_until <= now() or p_until > now() + interval '180 days' then
    return jsonb_build_object('error', 'bad_until');
  end if;
  select organizer_state into v_prev from events where id = p_event;
  if v_prev is null then return jsonb_build_object('error', 'not_found'); end if;
  update events set organizer_state = 'paused', paused_until = p_until where id = p_event;
  update event_occurrences set status = 'skipped', skip_note = 'Paused by organizer'
  where event_id = p_event and starts_at < p_until
    and status in ('scheduled','organizer_confirmed','in_progress','evidence_pending');
  insert into liveness_transitions (event_id, scope, prev, next, reason_code, shadow, actor, evidence)
  values (p_event, 'series', coalesce(v_prev, 'active'), 'paused', 'organizer_pause', false, v_uid,
          jsonb_build_object('until', p_until));
  return jsonb_build_object('ok', true);
end; $$;

-- ---- resume (from paused OR ended — forgiveness by design) ----
create or replace function public.liveness_resume_series(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prev text;
begin
  if v_uid is null or not _liveness_is_organizer(p_event, v_uid) then
    return jsonb_build_object('error', 'not_organizer');
  end if;
  select organizer_state into v_prev from events where id = p_event;
  if v_prev not in ('paused','ended') then return jsonb_build_object('error', 'not_paused'); end if;
  update events set organizer_state = 'active', paused_until = null where id = p_event;
  update event_occurrences set status = 'scheduled', skip_note = null, closed_at = null
  where event_id = p_event and starts_at > now()
    and status = 'skipped' and skip_note = 'Paused by organizer';
  insert into liveness_transitions (event_id, scope, prev, next, reason_code, shadow, actor)
  values (p_event, 'series', v_prev, 'active', 'organizer_resume', false, v_uid);
  return jsonb_build_object('ok', true);
end; $$;

-- ---- end the series ----
create or replace function public.liveness_end_series(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prev text;
begin
  if v_uid is null or not _liveness_is_organizer(p_event, v_uid) then
    return jsonb_build_object('error', 'not_organizer');
  end if;
  select organizer_state into v_prev from events where id = p_event;
  update events set organizer_state = 'ended', paused_until = null where id = p_event;
  update event_occurrences set status = 'cancelled'
  where event_id = p_event and starts_at > now()
    and status in ('scheduled','organizer_confirmed','skipped','evidence_pending');
  insert into liveness_transitions (event_id, scope, prev, next, reason_code, shadow, actor)
  values (p_event, 'series', coalesce(v_prev, 'active'), 'ended', 'organizer_end', false, v_uid);
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function
  public.liveness_skip_occurrence(uuid, date, text),
  public.liveness_unskip_occurrence(uuid, date),
  public.liveness_pause_series(uuid, timestamptz),
  public.liveness_resume_series(uuid),
  public.liveness_end_series(uuid)
to authenticated;

-- ============ liveness_run v2 ============
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
  v_unpaused int := 0; v_pause_skipped int := 0;
  v_flag boolean;
begin
  select enabled into v_flag from feature_flags where key = 'event_liveness_paused';
  if coalesce(v_flag, false) then
    return jsonb_build_object('skipped', 'breaker', 'job', v_job);
  end if;
  select enabled into v_flag from feature_flags where key = 'event_liveness_shadow';
  if not coalesce(v_flag, false) then
    return jsonb_build_object('skipped', 'shadow_off', 'job', v_job);
  end if;

  -- 0. auto-unpause series whose pause window has passed
  with un as (
    update events set organizer_state = 'active', paused_until = null
    where organizer_state = 'paused' and paused_until is not null and paused_until <= v_now
    returning id
  ),
  aud0 as (
    insert into liveness_transitions (event_id, scope, prev, next, reason_code, shadow, job_id)
    select id, 'series', 'paused', 'active', 'pause_window_ended', false, v_job from un
    returning 1
  )
  select count(*) into v_unpaused from aud0;

  -- 1. generate due occurrences (45 days back .. 1 day ahead)
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

  -- 2a. occurrences inside an active pause window close as skipped, never empty
  with ps as (
    update event_occurrences o
    set status = 'skipped', skip_note = coalesce(o.skip_note, 'Paused by organizer'), closed_at = v_now
    from events e
    where e.id = o.event_id
      and e.organizer_state = 'paused' and e.paused_until is not null
      and o.starts_at < e.paused_until
      and o.status in ('scheduled','organizer_confirmed','in_progress','evidence_pending')
    returning o.id, o.event_id
  ),
  audp as (
    insert into liveness_transitions (event_id, occurrence_id, scope, prev, next, reason_code, shadow, job_id)
    select event_id, id, 'occurrence', 'scheduled', 'skipped', 'pause_window', false, v_job from ps
    returning 1
  )
  select count(*) into v_pause_skipped from audp;

  -- 2b. cancel stragglers on ended series
  update event_occurrences o set status = 'cancelled'
  from events e
  where e.id = o.event_id and e.organizer_state = 'ended'
    and o.status in ('scheduled','organizer_confirmed','evidence_pending');

  -- 2c. close occurrences past end + grace, tallying queue evidence
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
    returning next as st
  )
  select count(*) filter (where st = 'completed_with_evidence'),
         count(*) filter (where st = 'completed_empty')
    into v_alive, v_empty from aud;

  -- 3. series machine (SHADOW)
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
    select st.id, st.liveness_shadow as prev, st.streak, st.last_alive, st.total_closed,
      case
        when st.organizer_state = 'paused' and coalesce(st.paused_until, v_now) > v_now then st.liveness_shadow
        when st.streak = 0 then 'active'
        when st.total_closed <= 2 then 'active'
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
    'unpaused', v_unpaused, 'pause_skipped', v_pause_skipped,
    'closed_with_evidence', v_alive, 'closed_empty', v_empty, 'series_changed', v_series);
end;
$$;

revoke all on function public.liveness_run(integer, text) from public, anon, authenticated;
grant execute on function public.liveness_run(integer, text) to service_role;
