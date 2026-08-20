-- 0180_courtside_devices.sql — device ops for the courtside fleet (audit PROD-005/SEC-008 · K2-05).
--
-- WHY. The courtside iPads are operationally invisible. If one is unplugged,
-- offline, or running a stale build, nobody knows until a venue calls — and at
-- that point an organizer is standing in front of a broken display with
-- players waiting. There is also no per-install identity: every device sends
-- the same `x-klimr-app` header, so diagnostics and abuse reports cannot be
-- attributed to a specific unit. That is fine for two pilot iPads and
-- untenable at ten venues.
--
-- WHAT. A registry keyed by INSTALL ID — a UUID the app mints on first run and
-- keeps in local storage. The device heartbeats every few minutes with its
-- version, network state, battery, and current session. From that you get:
--   · a live "is this venue up?" list in /admin/devices;
--   · stale-build detection before a venue hits a fixed bug;
--   · attribution for diagnostics reports (SEC-008 lands here);
--   · a replacement path — retire an install id, register the new unit.
--
-- The install id is NOT a secret and is NOT an auth credential: it identifies
-- a unit for operations only. Nothing is authorized by it, so a spoofed id can
-- at worst create a bogus device row, which an operator can retire.
-- Deliberately stores no precise location — the venue label is entered by a
-- human, and IP is stored only as a truncated hash for change detection.
--
-- NOT RISKY: one new table and one function; nothing existing is touched.
-- Backup not required.

create table if not exists public.courtside_devices (
  install_id     uuid primary key,
  label          text,
  venue_name     text,
  session_id     uuid,
  app_version    text,
  platform       text,
  network_state  text,
  battery_pct    int check (battery_pct is null or (battery_pct >= 0 and battery_pct <= 100)),
  last_ip_hash   text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  retired_at     timestamptz,
  notes          text
);

alter table public.courtside_devices enable row level security;
-- Server-only: written by the heartbeat function, read by admin screens
-- through the service role. No client grants.
revoke all on table public.courtside_devices from anon, authenticated, public;

create index if not exists courtside_devices_last_seen_idx
  on public.courtside_devices (last_seen_at desc)
  where retired_at is null;

-- Upsert a heartbeat. Deliberately preserves operator-owned fields (label,
-- venue_name, notes) so a device re-registering never wipes the human context
-- an operator entered — the device owns telemetry, the operator owns naming.
create or replace function public.courtside_heartbeat(
  p_install_id    uuid,
  p_app_version   text default null,
  p_platform      text default null,
  p_network_state text default null,
  p_battery_pct   int default null,
  p_session_id    uuid default null,
  p_ip_hash       text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.courtside_devices
    (install_id, app_version, platform, network_state, battery_pct, session_id, last_ip_hash, last_seen_at)
  values
    (p_install_id, p_app_version, p_platform, p_network_state,
     case when p_battery_pct between 0 and 100 then p_battery_pct end,
     p_session_id, p_ip_hash, now())
  on conflict (install_id) do update
    set app_version   = coalesce(excluded.app_version, public.courtside_devices.app_version),
        platform      = coalesce(excluded.platform, public.courtside_devices.platform),
        network_state = coalesce(excluded.network_state, public.courtside_devices.network_state),
        battery_pct   = coalesce(excluded.battery_pct, public.courtside_devices.battery_pct),
        session_id    = coalesce(excluded.session_id, public.courtside_devices.session_id),
        last_ip_hash  = coalesce(excluded.last_ip_hash, public.courtside_devices.last_ip_hash),
        last_seen_at  = now();
end; $$;

revoke all on function public.courtside_heartbeat(uuid, text, text, text, int, uuid, text) from anon, authenticated, public;
