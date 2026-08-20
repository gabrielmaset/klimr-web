-- 0184_courtside_device_auth.sql — authenticated, scalable courtside heartbeats.
--
-- WHY. `/api/courtside/heartbeat` accepted any POST carrying a spoofable
-- header. Anyone could invent install ids and inflate the fleet counters, and
-- the only defence was a per-IP rate limit — which is the wrong dimension
-- entirely: a venue's courts share one NAT'd IP (so real displays throttle each
-- other) while an attacker rotating IPs is unaffected. Rate limiting is a
-- capacity control, never an authenticity control.
--
-- MODEL: server-minted device token, server-stored HASH.
--   1. A display registers ONCE with the session join code it is showing —
--      proof it is at the venue, since that code is how players join.
--   2. The server mints a 32-byte random token, stores only sha256(token), and
--      returns the token once. The client cannot choose its own token.
--   3. Every heartbeat presents install_id + token; the server hashes and
--      compares. Unknown, mismatched, or retired ⇒ silently ignored.
--   4. Retiring a device in /admin/devices revokes the token immediately.
--
-- Deliberately NOT client-side encryption of a shared secret: whatever a
-- client can decrypt, anyone holding that device can also decrypt, so it adds
-- obfuscation rather than security. The real protections are that the token is
-- server-minted, stored only as a hash (a database leak yields no usable
-- tokens), bound to one session, and revocable — the same model as a password.
-- Honest limit: a kiosk token is extractable by someone with physical access
-- to that display. This is DEVICE identity, not user authentication, and the
-- bar it sets — "you must have had access to a real display or its join code"
-- — is the right one for telemetry that only writes a dashboard row.
--
-- SCALE. 1,000 displays beating every 3 minutes is ~5.5 writes/second. The
-- authenticated path costs ONE primary-key-targeted statement: no separate
-- rate-limiter round trip, because the token check is the gate and the
-- in-statement throttle below bounds a misbehaving client for free.
--
-- NOT RISKY: additive columns plus function replacement. Nothing has ever
-- called the old heartbeat in production (no rows exist), so dropping its
-- signature is a no-op. Backup not required.

alter table public.courtside_devices
  add column if not exists token_hash    text,
  add column if not exists registered_at timestamptz,
  add column if not exists revoked_at    timestamptz,
  add column if not exists beat_count    bigint not null default 0;

-- Registration is rare and always by install id; heartbeats are frequent and
-- also by install id — the primary key already serves both.

-- ── Register a display against a live session ──────────────────────────────
-- Returns true when the join code matched a session that can be displayed.
-- The caller (route handler) generates the token and passes only its hash.
create or replace function public.courtside_register(
  p_install_id  uuid,
  p_code        text,
  p_token_hash  text,
  p_platform    text default null,
  p_app_version text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  -- The code is the same credential players use to join, so possessing it is
  -- evidence of being at the venue. Accept either the join code or the
  -- courtside display code, and never a session that has ended.
  select s.id into v_session
    from public.court_sessions s
   where (upper(s.code) = upper(p_code) or upper(coalesce(s.display_code, '')) = upper(p_code))
     and s.status <> 'ended'
   limit 1;

  if v_session is null then
    return false;
  end if;

  insert into public.courtside_devices
    (install_id, session_id, token_hash, platform, app_version, registered_at, last_seen_at)
  values
    (p_install_id, v_session, p_token_hash, p_platform, p_app_version, now(), now())
  on conflict (install_id) do update
    set session_id    = excluded.session_id,
        token_hash    = excluded.token_hash,   -- re-registering rotates the token
        platform      = coalesce(excluded.platform, public.courtside_devices.platform),
        app_version   = coalesce(excluded.app_version, public.courtside_devices.app_version),
        registered_at = now(),
        revoked_at    = null,                  -- a fresh registration un-revokes
        last_seen_at  = now();
  return true;
end; $$;

-- ── Authenticated heartbeat ────────────────────────────────────────────────
-- Returns true when the beat was accepted. One statement, primary-key targeted.
-- The `last_seen_at < now() - 60s` predicate silently absorbs a client that
-- beats too often: the row simply is not updated, costing no extra query and
-- giving a chatty or hostile client nothing.
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
     and d.last_seen_at < now() - interval '60 seconds'
  returning true;
$$;

-- Retiring a device from /admin/devices must also kill its token.
create or replace function public.courtside_revoke(p_install_id uuid) returns void
language sql
security definer
set search_path = public
as $$
  update public.courtside_devices
     set revoked_at = now(), token_hash = null
   where install_id = p_install_id;
$$;

-- Remove the old unauthenticated signature so it cannot be called by accident.
drop function if exists public.courtside_heartbeat(uuid, text, text, text, int, uuid, text);

-- Grants: service_role must be able to EXECUTE these (the 0183 lesson —
-- `revoke ... from public` strips the implicit grant the app depends on).
revoke all on function public.courtside_register(uuid, text, text, text, text) from anon, authenticated, public;
revoke all on function public.courtside_heartbeat(uuid, text, text, text, text, int, uuid, text) from anon, authenticated, public;
revoke all on function public.courtside_revoke(uuid) from anon, authenticated, public;
grant execute on function public.courtside_register(uuid, text, text, text, text) to service_role;
grant execute on function public.courtside_heartbeat(uuid, text, text, text, text, int, uuid, text) to service_role;
grant execute on function public.courtside_revoke(uuid) to service_role;
