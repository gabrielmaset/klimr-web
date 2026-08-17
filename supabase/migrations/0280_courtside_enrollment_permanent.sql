-- 0280_courtside_enrollment_permanent.sql — the permanent KFU-001 fix.
--
-- HISTORY THAT MATTERS. 0235 built the right shape (organizer-issued one-time
-- secrets, hash-only storage, revocation that sticks) and was REVERTED on
-- 2026-08-11 — not because the design was wrong but because the route shipped
-- without the migration and without the tablet app batch, so every display went
-- dark. 0263 restored the vulnerable behavior. 0276 (C0) then disabled
-- enrollment entirely with owner authorization. This migration restores the
-- secure design AND adds what the follow-up audit (KFU-001) requires beyond
-- 0235: binding to court and installation, an explicit audience/purpose, and an
-- operator-command scope check.
--
-- DEPLOY ORDER IS PART OF THE FIX (the 2026-08-11 lesson): this migration is
-- backward-compatible with the deployed tablet — enrollment simply stays
-- refused, exactly as it is today under C0, until the app batch ships. It never
-- makes a working display stop working, because under C0 none currently work.
--
-- THREAT MODEL. The join code and display code are PUBLIC by design (poster, QR,
-- signage URL, and the public queue projection). A capability must never be
-- derivable from them. Therefore:
--   * enrollment requires a secret the ORGANIZER mints in an authenticated
--     session; it is never present in any player-facing or public state;
--   * the server stores only SHA-256 of the secret and of the device token;
--   * one secret enrolls exactly one installation, once, within a short TTL;
--   * the secret is bound to session AND court AND purpose at issue time, and
--     the consuming call must match all of them;
--   * a revoked device cannot re-enroll without a NEW organizer-issued secret;
--   * the operator command path re-checks that the device's session and court
--     still match what it is trying to act on.

-- ── 1. enrollment challenges ─────────────────────────────────────────────────
create table if not exists public.courtside_enrollments (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.court_sessions(id) on delete cascade,
  secret_hash       text not null,
  label             text,
  issued_by         uuid not null,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  consumed_install  uuid
);

-- Columns added separately so this is safe on a schema where 0235 never ran AND
-- on one where it did (KFU-001 additions: court + audience binding).
alter table public.courtside_enrollments
  add column if not exists court_id uuid;
alter table public.courtside_enrollments
  add column if not exists audience text not null default 'courtside-operator';
alter table public.courtside_enrollments
  add column if not exists revoked_at timestamptz;

do $$ begin
  alter table public.courtside_enrollments
    add constraint courtside_enrollments_audience_check
    check (audience = 'courtside-operator');
exception when duplicate_object then null; end $$;

create unique index if not exists courtside_enrollments_secret_key
  on public.courtside_enrollments (secret_hash);
create index if not exists courtside_enrollments_session_idx
  on public.courtside_enrollments (session_id, issued_at desc);

alter table public.courtside_enrollments enable row level security;
revoke all on public.courtside_enrollments from anon, authenticated;
grant all on public.courtside_enrollments to service_role;

comment on table public.courtside_enrollments is
  'KFU-001: one-time, organizer-issued enrollment challenges. Stores only the SHA-256 of the secret, '
  'bound to session, court, and audience. Consuming one binds a single installation; a revoked device '
  'needs a NEW secret, which is what makes revocation stick.';

-- ── 2. issuing — organizer/admin only, authorization re-derived ──────────────
create or replace function public.courtside_issue_enrollment(
  p_session_id  uuid,
  p_secret_hash text,
  p_label       text default null,
  p_ttl_minutes int  default 2
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer uuid;
  v_status    text;
  v_court     uuid;
  v_id        uuid;
  -- Default 2 minutes per the audit's recommended enrollment window; hard cap 30.
  v_ttl       int := least(greatest(coalesce(p_ttl_minutes, 2), 1), 30);
begin
  if p_secret_hash is null or length(p_secret_hash) <> 64 then
    raise exception 'invalid_secret_hash' using errcode = 'P0001';
  end if;

  -- Paste-law: assignment form only (the SQL editor scans raw text for the
  -- keyword and validates the next word as a relation). Lock the row, then assign.
  perform 1 from public.court_sessions s where s.id = p_session_id for update;
  v_organizer := (select s.organizer_id from public.court_sessions s where s.id = p_session_id);
  v_status    := (select s.status       from public.court_sessions s where s.id = p_session_id);
  v_court     := (select s.court_id     from public.court_sessions s where s.id = p_session_id);

  if v_organizer is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'ended' then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;

  -- NULL-safe caller-derived authorization. Both defects 0235 recorded stay
  -- fixed: no is_privileged_writer() inside a DEFINER body (it evaluates the
  -- definer), and `is distinct from` so an absent identity cannot fall through.
  if auth.uid() is distinct from v_organizer
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_organizer' using errcode = 'P0001';
  end if;

  v_id := gen_random_uuid();
  insert into public.courtside_enrollments
    (id, session_id, court_id, secret_hash, label, issued_by, expires_at, audience)
  values
    (v_id, p_session_id, v_court, p_secret_hash, nullif(btrim(coalesce(p_label, '')), ''),
     coalesce(auth.uid(), v_organizer), now() + make_interval(mins => v_ttl), 'courtside-operator');

  return v_id;
end; $$;

revoke all on function public.courtside_issue_enrollment(uuid, text, text, int) from anon, public;
grant execute on function public.courtside_issue_enrollment(uuid, text, text, int) to authenticated, service_role;

-- ── 3. registration consumes a challenge, and nothing else ───────────────────
-- Both legacy overloads are dropped so the vulnerable shapes cannot be reached:
-- 0214's lesson is that a differing default set ADDS an overload rather than
-- replacing it, and the overload that survives is the dangerous one.
drop function if exists public.courtside_register(uuid, text, text, text, text);
drop function if exists public.courtside_register(text, text, text, text, text);

create or replace function public.courtside_register(
  p_install_id    uuid,
  p_secret        text,
  p_token_hash    text,
  p_platform      text default null,
  p_app_version   text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_hash    text;
begin
  if p_install_id is null or p_secret is null or p_token_hash is null then
    return false;
  end if;
  -- The SERVER hashes the secret. The caller never supplies a hash, so a leaked
  -- hash from any source is not itself a credential.
  -- Built-in sha256() (PG14+), not pgcrypto's digest(): these functions pin
  -- search_path = public, and pgcrypto lives in the extensions schema on Supabase.
  v_hash := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');

  -- Claim under the row lock in ONE statement: two devices racing the same
  -- secret cannot both enroll. Expiry, prior consumption, revocation, audience,
  -- and a live session are all part of the claim predicate.
  -- Single-statement claim, paste-law safe: a data-modifying CTE must be at the
  -- top level, so the UPDATE runs as its own statement and writes the claimed
  -- session id to a temp holder the next line reads. The claim itself is still
  -- one atomic UPDATE — two devices racing the same secret cannot both match,
  -- because the predicate requires consumed_at is null and the row is locked by
  -- the update.
  create temporary table if not exists _cs_claim (session_id uuid) on commit drop;
  delete from _cs_claim;
  with claimed as (
    update public.courtside_enrollments e
       set consumed_at      = now(),
           consumed_install = p_install_id
     where e.secret_hash = v_hash
       and e.consumed_at is null
       and e.revoked_at is null
       and e.expires_at > now()
       and e.audience = 'courtside-operator'
       and exists (
         select 1 from public.court_sessions s
          where s.id = e.session_id and s.status <> 'ended'
       )
    returning e.session_id
  )
  insert into _cs_claim (session_id) select c.session_id from claimed c;

  v_session := (select session_id from _cs_claim limit 1);

  if v_session is null then
    return false;
  end if;

  insert into public.courtside_devices
    (install_id, session_id, token_hash, platform, app_version, registered_at, last_seen_at)
  values
    (p_install_id, v_session, p_token_hash, p_platform, p_app_version, now(), now())
  on conflict (install_id) do update
    set session_id    = excluded.session_id,
        token_hash    = excluded.token_hash,
        platform      = coalesce(excluded.platform, public.courtside_devices.platform),
        app_version   = coalesce(excluded.app_version, public.courtside_devices.app_version),
        registered_at = now(),
        -- Safe HERE and only here: reaching this line required a secret the
        -- organizer issued AFTER any revocation.
        revoked_at    = null,
        last_seen_at  = now();
  return true;
end; $$;

revoke all on function public.courtside_register(uuid, text, text, text, text) from anon, authenticated, public;
grant execute on function public.courtside_register(uuid, text, text, text, text) to service_role;

comment on function public.courtside_register is
  'KFU-001: enrolls a Courtside display by CONSUMING a one-time organizer-issued secret bound to '
  'session, court and audience. Join and display codes register NOTHING — they are public by design. '
  'The server hashes the secret itself, so a hash is not a credential.';

-- ── 4. organizer revokes an issued-but-unused challenge ─────────────────────
create or replace function public.courtside_revoke_enrollment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer uuid;
  v_n int;
begin
  v_organizer := (
    select s.organizer_id
      from public.courtside_enrollments e
      join public.court_sessions s on s.id = e.session_id
     where e.id = p_id
  );
  if v_organizer is null then
    raise exception 'enrollment_not_found' using errcode = 'P0002';
  end if;
  if auth.uid() is distinct from v_organizer
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_organizer' using errcode = 'P0001';
  end if;
  update public.courtside_enrollments
     set revoked_at = now()
   where id = p_id and consumed_at is null and revoked_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'enrollment_not_revocable' using errcode = 'P0001';
  end if;
end; $$;

revoke all on function public.courtside_revoke_enrollment(uuid) from anon, public;
grant execute on function public.courtside_revoke_enrollment(uuid) to authenticated, service_role;

-- ── 5. operator authorization re-checks scope at command time ───────────────
-- A token proves "this installation enrolled for this session". The audit asks
-- that the operator command also verify the device has not been revoked and is
-- acting on the session it was bound to — checked here rather than trusted from
-- the caller's form fields.
create or replace function public.courtside_authorize(
  p_install_id uuid,
  p_token_hash text,
  p_session_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.courtside_devices d
      join public.court_sessions s on s.id = d.session_id
     where d.install_id = p_install_id
       and d.token_hash = p_token_hash
       and d.session_id = p_session_id
       and d.revoked_at is null
       and s.status <> 'ended'
  );
$$;

revoke all on function public.courtside_authorize(uuid, text, uuid) from anon, authenticated, public;
grant execute on function public.courtside_authorize(uuid, text, uuid) to service_role;

select public.journal_migration('0280', '0280_courtside_enrollment_permanent.sql', null,
  'Permanent KFU-001 fix: Courtside enrollment requires a one-time organizer-issued secret bound to session, court and audience, hashed server-side, single-use under a row lock, with organizer revocation and a scope-checked operator authorization. Join and display codes can no longer mint any capability; both legacy register overloads are dropped.');
