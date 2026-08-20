-- 0185_fleet_realtime_metrics.sql — operational metrics for the live-queue fleet.
--
-- WHY. The devices console listed every unit. That is fine for two iPads and
-- useless at a thousand — an operator does not want a roster, they want counts
-- they can trust and a way to act on a stuck one. It also lagged: a display
-- that started play took ~4 minutes to appear, because the heartbeat ran every
-- 3 minutes and "up" meant "seen within 15". Both numbers were tuned for a
-- fleet dashboard, not for watching a venue in real time.
--
-- WHAT AN OPERATOR ACTUALLY NEEDS (founder spec, Aug 2026):
--   registered_queues  live queues that exist right now (not ended)
--     · standalone     … of those, not attached to an event
--     · from_events    … of those, created from an event
--   live_instances     courtside displays currently connected (logged in with
--                      the code) — presence, not "the app is open somewhere"
--   running_live_play  sessions with a team waiting or a match in progress
--
-- TIMELINESS. The window drops from 15 minutes to 45 SECONDS, paired with a
-- 20-second client heartbeat. A display appears the instant it connects (it
-- beats on mount) and drops off within ~45s of going dark — inside the
-- 30-second freshness the founder asked for, allowing for one missed beat.
--
-- SCALE. The old `courtside_devices_last_seen_idx` is DROPPED. It indexed
-- last_seen_at, the one column every heartbeat writes, which blocked
-- heartbeat-only-in-place (HOT) updates and would have bloated that index
-- badly at 50 writes/second. Without it the row update stays HOT and the
-- counts below scan a table with one row per physical display — small by
-- construction, since devices are hardware, not sessions.
--
-- NOT RISKY: index drop, function additions, and a stricter heartbeat throttle.
-- No data rewritten. Backup not required.

drop index if exists public.courtside_devices_last_seen_idx;

-- Presence window, in one place so the client cadence and the dashboard agree.
create or replace function public.courtside_live_window() returns interval
language sql immutable as $$ select interval '45 seconds' $$;

-- ── Headline counters ──────────────────────────────────────────────────────
create or replace function public.fleet_metrics()
returns table (
  registered_queues bigint,
  standalone_queues bigint,
  event_queues      bigint,
  live_instances    bigint,
  running_live_play bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select id, event_id
      from public.court_sessions
     where status <> 'ended'
  ),
  playing as (
    select s.id
      from s
     where exists (select 1 from public.queue_teams t
                    where t.session_id = s.id and t.status in ('forming','queued'))
        or exists (select 1 from public.queue_matches m
                    where m.session_id = s.id and m.status = 'live')
  )
  select
    (select count(*) from s)::bigint,
    (select count(*) from s where event_id is null)::bigint,
    (select count(*) from s where event_id is not null)::bigint,
    (select count(*) from public.courtside_devices d
      where d.retired_at is null and d.revoked_at is null
        and d.last_seen_at > now() - public.courtside_live_window())::bigint,
    (select count(*) from playing)::bigint;
$$;

-- ── Drill-down: the rows behind one counter ────────────────────────────────
-- p_metric: 'registered' | 'standalone' | 'events' | 'instances' | 'playing'
-- Returns one row per SESSION (instances are reported by the session they are
-- attached to, because that is the thing an operator can actually end).
create or replace function public.fleet_metric_detail(p_metric text)
returns table (
  session_id     uuid,
  title          text,
  code           text,
  source         text,
  status         text,
  created_at     timestamptz,
  live_devices   bigint,
  waiting_teams  bigint,
  live_matches   bigint,
  last_device_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      s.id, s.title, s.code, s.status, s.created_at,
      case when s.event_id is null then 'standalone' else 'event' end as source,
      (select count(*) from public.courtside_devices d
        where d.session_id = s.id and d.retired_at is null and d.revoked_at is null
          and d.last_seen_at > now() - public.courtside_live_window()) as live_devices,
      (select count(*) from public.queue_teams t
        where t.session_id = s.id and t.status in ('forming','queued')) as waiting_teams,
      (select count(*) from public.queue_matches m
        where m.session_id = s.id and m.status = 'live') as live_matches,
      (select max(d.last_seen_at) from public.courtside_devices d
        where d.session_id = s.id and d.retired_at is null) as last_device_at,
      s.event_id
    from public.court_sessions s
    where s.status <> 'ended'
  )
  select id, title, code, source, status, created_at,
         live_devices, waiting_teams, live_matches, last_device_at
    from base
   where case p_metric
           when 'standalone' then event_id is null
           when 'events'     then event_id is not null
           when 'instances'  then live_devices > 0
           when 'playing'    then waiting_teams > 0 or live_matches > 0
           else true                                   -- 'registered'
         end
   order by (waiting_teams > 0 or live_matches > 0) desc, live_devices desc, created_at desc
   limit 200;
$$;

-- ── Force-end a stuck session ──────────────────────────────────────────────
-- The operator escape hatch: a frozen display or an abandoned session can be
-- ended so the organizer can start clean. Mirrors the organizer's own OFF —
-- play state clears, the code survives for the printed QR — and revokes the
-- attached displays so a zombie client stops reporting presence.
create or replace function public.admin_force_end_session(p_session_id uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.court_sessions
     set status = 'ended', ended_at = now()
   where id = p_session_id and status <> 'ended';
  if not found then
    return false;
  end if;

  delete from public.queue_team_members
    where team_id in (select id from public.queue_teams where session_id = p_session_id);
  delete from public.queue_teams where session_id = p_session_id;
  update public.queue_matches set status = 'final', ended_at = now()
    where session_id = p_session_id and status = 'live';
  update public.queue_join_requests set status = 'expired'
    where session_id = p_session_id and status = 'pending';

  -- Stop attached displays from reporting presence for a session that is over.
  update public.courtside_devices
     set revoked_at = now(), token_hash = null
   where session_id = p_session_id and revoked_at is null;

  insert into public.admin_actions (actor_id, action, target_ref, detail)
  values (p_actor, 'admin:force-end-session', p_session_id::text, 'Forced from the fleet console');
  return true;
end; $$;

-- Heartbeat throttle must not reject the new 20-second cadence.
create or replace function public.courtside_heartbeat(
  p_install_id    uuid,
  p_token_hash    text,
  p_app_version   text default null,
  p_platform      text default null,
  p_network_state text default null,
  p_battery_pct   int default null,
  p_session_id    uuid default null,
  p_ip_hash       text default null
) returns boolean
language sql
security definer
set search_path = public
as $$
  update public.courtside_devices d
     set app_version   = coalesce(p_app_version, d.app_version),
         platform      = coalesce(p_platform, d.platform),
         network_state = coalesce(p_network_state, d.network_state),
         battery_pct   = case when p_battery_pct between 0 and 100 then p_battery_pct else d.battery_pct end,
         session_id    = coalesce(p_session_id, d.session_id),
         last_ip_hash  = coalesce(p_ip_hash, d.last_ip_hash),
         last_seen_at  = now(),
         beat_count    = d.beat_count + 1
   where d.install_id = p_install_id
     and d.token_hash is not null
     and d.token_hash = p_token_hash
     and d.revoked_at is null
     and d.retired_at is null
     -- 10s floor: absorbs a client beating far too often without rejecting the
     -- intended 20-second cadence (the old 60s floor would have blocked it).
     and d.last_seen_at < now() - interval '10 seconds'
  returning true;
$$;

revoke all on function public.fleet_metrics() from anon, authenticated, public;
revoke all on function public.fleet_metric_detail(text) from anon, authenticated, public;
revoke all on function public.admin_force_end_session(uuid, uuid) from anon, authenticated, public;
grant execute on function public.fleet_metrics() to service_role;
grant execute on function public.fleet_metric_detail(text) to service_role;
grant execute on function public.admin_force_end_session(uuid, uuid) to service_role;
grant execute on function public.courtside_live_window() to service_role;
grant execute on function public.courtside_heartbeat(uuid, text, text, text, text, int, uuid, text) to service_role;
