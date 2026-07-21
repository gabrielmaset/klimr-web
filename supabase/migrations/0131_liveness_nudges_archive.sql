-- 0131_liveness_nudges_archive.sql — Event Pulse rollout step 2: organizer nudges
-- (behind `event_liveness_nudges`) written set-based by the job itself on
-- watch/dormant transitions (creator + managers, forgiving copy), and the
-- six-month dormant → archived rule (shadow column; silent — no nudge for
-- archive; dormant_at survives the transition so the audit stays coherent).
-- liveness_run v3 wholly replaces v2.
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
  v_unpaused int := 0; v_pause_skipped int := 0; v_nudged int := 0;
  v_flag boolean; v_nudge_on boolean := false;
begin
  select enabled into v_flag from feature_flags where key = 'event_liveness_paused';
  if coalesce(v_flag, false) then
    return jsonb_build_object('skipped', 'breaker', 'job', v_job);
  end if;
  select enabled into v_flag from feature_flags where key = 'event_liveness_shadow';
  if not coalesce(v_flag, false) then
    return jsonb_build_object('skipped', 'shadow_off', 'job', v_job);
  end if;
  select coalesce(enabled, false) into v_nudge_on from feature_flags where key = 'event_liveness_nudges';

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
    select e.id, e.recurrence, e.liveness_shadow, e.organizer_state, e.paused_until, e.dormant_at,
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
             and st.liveness_shadow in ('dormant','archived')
             and st.dormant_at is not null
             and st.dormant_at <= v_now - interval '6 months'
          then 'archived'
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
                          when t.next in ('dormant','archived') then e.dormant_at
                          else null end
    from target t
    where e.id = t.id
      and (e.liveness_shadow <> t.next or e.empty_streak <> t.streak
           or e.last_alive_at is distinct from t.last_alive)
    returning e.id, t.prev, t.next, t.streak
  ),
  aud2 as (
    insert into liveness_transitions (event_id, scope, prev, next, reason_code, shadow, evidence, job_id)
    select c.id, 'series', c.prev, c.next,
           case when c.next = 'archived' then 'dormant_six_months'
                when c.next = 'dormant' then 'three_strikes'
                when c.next = 'watch' then 'empty_streak'
                else 'evidence_resumed' end,
           true, jsonb_build_object('streak', c.streak), v_job
    from chg c where c.prev <> c.next
    returning 1
  ),
  nudge_targets as (
    select c.id as event_id, c.next, ev.title, ev.created_by as uid
    from chg c join events ev on ev.id = c.id
    where v_nudge_on and c.prev <> c.next and c.next in ('watch','dormant')
    union
    select c.id, c.next, ev.title, m.user_id
    from chg c
    join events ev on ev.id = c.id
    join event_managers m on m.event_id = c.id
    where v_nudge_on and c.prev <> c.next and c.next in ('watch','dormant')
  ),
  nud as (
    insert into notifications (user_id, kind, title, body, link_url)
    select nt.uid, 'system',
      case when nt.next = 'watch'
           then 'Quiet stretch at “' || left(nt.title, 60) || '”?'
           else '“' || left(nt.title, 60) || '” looks inactive' end,
      case when nt.next = 'watch'
           then 'The last date had no verified check-ins. All good? You can skip a date or pause the series from the event page — skipped dates never count against you.'
           else 'Three dates in a row had no verified activity. Pause or end the series if it’s wrapped up — or just run your next session and it springs right back.' end,
      '/events/' || nt.event_id
    from nudge_targets nt
    where nt.uid is not null
    returning 1
  )
  select (select count(*) from aud2), (select count(*) from nud)
    into v_series, v_nudged;

  return jsonb_build_object('job', v_job, 'generated', v_generated,
    'unpaused', v_unpaused, 'pause_skipped', v_pause_skipped,
    'closed_with_evidence', v_alive, 'closed_empty', v_empty,
    'series_changed', v_series, 'nudged', v_nudged);
end;
$$;

revoke all on function public.liveness_run(integer, text) from public, anon, authenticated;
grant execute on function public.liveness_run(integer, text) to service_role;
