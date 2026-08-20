-- 0182_courtside_fleet_status.sql — tiered "how many courtside apps are actually WORKING"
-- (extends K2-05 device ops, founder request Aug 2026).
--
-- WHY. "How many iPads are on?" is the wrong question. An app can be open on a
-- charger in a back office all week and heartbeat perfectly while running no
-- play at all. The number that matters operationally — and the one a venue
-- conversation or an investor question turns on — is how many displays are
-- actually driving a live queue with players in it right now.
--
-- FOUR TIERS, deliberately distinct:
--   registered      every non-retired device that has ever checked in
--   app_open        heartbeat within 15 min — the app is running, nothing more
--   on_live_session app_open AND pointed at a session whose status is 'live'
--   in_active_play  on_live_session AND that session has PLAY IN IT: a team
--                   waiting or forming, or a live match on a court
--
-- The last tier is the honest one, and its definition was tightened by
-- evidence. The first draft also counted "queue state version bumped in the
-- last 20 minutes" as activity. The harness showed that is wrong: the K2-02
-- version counter is bumped by session-level edits too, so merely CREATING an
-- empty session marked it as active play for twenty minutes. Presence of a
-- waiting team or a live match is the signal that cannot be faked by setup.
-- A venue between games briefly drops out of this tier, which is correct —
-- the number answers "is there play happening right now", not "was there".
--
-- Idle-but-open devices are not a fault — a venue may be between sessions —
-- so the console shows the gap between tiers rather than flagging it as an
-- error. A device open for days with zero active play IS worth a look, and
-- the per-device tier below makes that visible.
--
-- NOT RISKY: two read-only functions, no schema change. Backup not required.

-- Fleet-wide counters for the admin dashboard tile and the devices console.
create or replace function public.courtside_fleet_status()
returns table (
  registered       bigint,
  app_open         bigint,
  on_live_session  bigint,
  in_active_play   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select
      dev.install_id,
      dev.session_id,
      dev.last_seen_at > now() - interval '15 minutes' as is_open
    from public.courtside_devices dev
    where dev.retired_at is null
  ),
  enriched as (
    select
      d.install_id,
      d.is_open,
      (d.is_open and s.id is not null and s.status = 'live') as on_live,
      (
        d.is_open
        and s.id is not null
        and s.status = 'live'
        and (
          exists (
            select 1 from public.queue_teams t
             where t.session_id = s.id and t.status in ('forming', 'queued')
          )
          or exists (
            select 1 from public.queue_matches m
             where m.session_id = s.id and m.status = 'live'
          )
        )
      ) as in_play
    from d
    left join public.court_sessions s on s.id = d.session_id
  )
  select
    count(*)::bigint,
    count(*) filter (where is_open)::bigint,
    count(*) filter (where on_live)::bigint,
    count(*) filter (where in_play)::bigint
  from enriched;
$$;

-- Per-device tier, so the console can label each unit rather than only totalling.
-- Returns one row per non-retired device: 'in_play' | 'on_live_session' |
-- 'app_open' | 'offline'.
create or replace function public.courtside_device_tiers()
returns table (
  install_id   uuid,
  tier         text,
  session_id   uuid,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dev.install_id,
    case
      when dev.last_seen_at <= now() - interval '15 minutes' then 'offline'
      when s.id is null or s.status <> 'live' then 'app_open'
      when exists (select 1 from public.queue_teams t where t.session_id = s.id and t.status in ('forming','queued'))
        or exists (select 1 from public.queue_matches m where m.session_id = s.id and m.status = 'live')
        then 'in_play'
      else 'on_live_session'
    end as tier,
    dev.session_id,
    dev.last_seen_at
  from public.courtside_devices dev
  left join public.court_sessions s on s.id = dev.session_id
  where dev.retired_at is null;
$$;

revoke all on function public.courtside_fleet_status() from anon, authenticated, public;
revoke all on function public.courtside_device_tiers() from anon, authenticated, public;
