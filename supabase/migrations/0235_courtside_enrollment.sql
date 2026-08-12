-- 0235_courtside_enrollment.sql — adds organizer-issued, one-time Courtside
-- enrollment secrets and makes them the ONLY way to mint an operator capability.
--
-- KRA-001 (P0, re-audit 2026-08-10). KCDX-007 hardened the operator COMMANDS:
-- gameOverByCode/startNextByCode/stepDownByCode now demand a proved device token.
-- It did not harden how that token is OBTAINED. `courtside_register` accepted the
-- session's join code — the value printed on the poster, rendered as the walk-up
-- QR, and deliberately kept public by lib/queue-projection.ts — or the display
-- code, which is visible on the tablet and sits in the signage URL. Either one,
-- plus any syntactically valid UUID the caller invented, returned a fresh operator
-- token. Worse, the upsert set `revoked_at = null`, so revoking a device lasted
-- exactly until it registered again.
--
-- The whole point of a capability is that it cannot be derived from something the
-- public already holds. Owner decision OD-1 (2026-08-10): enrollment requires a
-- separate one-time secret the organizer issues, never present in player or public
-- state, and a revoked device requires organizer re-approval.
--
-- Shape follows the token pattern already used here: the SERVER mints the secret
-- and stores only its SHA-256. The plaintext is shown to the organizer once and is
-- not recoverable from the database.

-- ── 1. the enrollment secret ──────────────────────────────────────────────
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

-- One secret is one device. The unique hash makes a replayed secret unrepresentable
-- rather than merely rejected, and the partial index is what the consume path probes.
create unique index if not exists courtside_enrollments_secret_key
  on public.courtside_enrollments (secret_hash);
create index if not exists courtside_enrollments_session_idx
  on public.courtside_enrollments (session_id, issued_at desc);

alter table public.courtside_enrollments enable row level security;
-- Server-only, like courtside_devices (0180). Nothing here is member-readable:
-- the hash is a credential and the row is written by SECURITY DEFINER commands.
revoke all on public.courtside_enrollments from anon, authenticated;
grant all on public.courtside_enrollments to service_role;

comment on table public.courtside_enrollments is
  'KRA-001: one-time, organizer-issued secrets that authorize a Courtside display to enroll. Stores '
  'only the SHA-256 of the secret. Consuming one binds a device to a session; a revoked device needs '
  'a NEW secret, which is what makes revocation stick.';

-- ── 2. issuing (organizer or admin only) ──────────────────────────────────
-- The caller mints the secret and passes its hash, mirroring how the register
-- route already mints device tokens. Authorization is re-derived here from the
-- canonical session row — never accepted from the caller.
create or replace function public.courtside_issue_enrollment(
  p_session_id  uuid,
  p_secret_hash text,
  p_label       text default null,
  p_ttl_minutes int  default 30
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer uuid;
  v_status    text;
  v_id        uuid;
  v_ttl       int := least(greatest(coalesce(p_ttl_minutes, 30), 1), 240);
begin
  if p_secret_hash is null or length(p_secret_hash) <> 64 then
    raise exception 'invalid_secret_hash';
  end if;

  select s.organizer_id, s.status into v_organizer, v_status
    from public.court_sessions s
   where s.id = p_session_id
   for update;

  if v_organizer is null then
    raise exception 'session_not_found';
  end if;
  if v_status = 'ended' then
    raise exception 'session_ended';
  end if;

  -- Caller-derived authorization ONLY, and NULL-safe.
  --
  -- Two defects lived in the first draft of these four lines, and both were found
  -- by running the test rather than reading the code:
  --   1. It gated on `public.is_privileged_writer()`, which inside a SECURITY
  --      DEFINER function evaluates the DEFINER, not the caller — the mistake
  --      0203 and CLAUDE.md both already record.
  --   2. It then compared `auth.uid() = v_organizer` directly. When the caller has
  --      no identity that comparison is NULL, `not NULL` is NULL, and `if NULL`
  --      does not fire — so an unauthenticated caller fell straight through the
  --      guard. Indeterminate identity became allow, which is exactly the
  --      fail-open shape KRA-015 raises elsewhere in this audit.
  -- `is distinct from` is NULL-safe, and the role check is coalesced.
  if auth.uid() is distinct from v_organizer
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_organizer';
  end if;

  insert into public.courtside_enrollments (session_id, secret_hash, label, issued_by, expires_at)
  values (p_session_id, p_secret_hash, nullif(btrim(coalesce(p_label, '')), ''),
          coalesce(auth.uid(), v_organizer), now() + make_interval(mins => v_ttl))
  returning id into v_id;

  return v_id;
end; $$;

revoke all on function public.courtside_issue_enrollment(uuid, text, text, int) from anon, public;
grant execute on function public.courtside_issue_enrollment(uuid, text, text, int) to authenticated, service_role;

-- ── 3. registration consumes a secret, and nothing else ───────────────────
-- The old five-argument signature is DROPPED rather than left beside this one.
-- 0214 recorded why: a differing default set does not replace a function, it adds
-- an overload — and the overload that stays is the vulnerable one.
drop function if exists public.courtside_register(uuid, text, text, text, text);

create or replace function public.courtside_register(
  p_install_id    uuid,
  p_secret_hash   text,
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
begin
  -- Claim the enrollment under a lock, in ONE statement, so two devices racing
  -- the same secret cannot both enroll. The predicate is the claim: an already
  -- consumed or expired row matches nothing and the caller gets a plain false.
  update public.courtside_enrollments e
     set consumed_at      = now(),
         consumed_install = p_install_id
   where e.secret_hash = p_secret_hash
     and e.consumed_at is null
     and e.expires_at > now()
     and exists (
       select 1 from public.court_sessions s
        where s.id = e.session_id and s.status <> 'ended'
     )
  returning e.session_id into v_session;

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
        -- Clearing revoked_at is safe HERE and was not safe before: reaching this
        -- line now requires a secret the organizer issued after the revocation.
        revoked_at    = null,
        last_seen_at  = now();
  return true;
end; $$;

revoke all on function public.courtside_register(uuid, text, text, text, text) from anon, authenticated, public;
grant execute on function public.courtside_register(uuid, text, text, text, text) to service_role;

comment on function public.courtside_register is
  'KRA-001: enrolls a Courtside display by CONSUMING a one-time organizer-issued secret. The session '
  'join code and display code no longer register anything — they are public by design and cannot be '
  'operator credentials.';

-- ── 4. housekeeping ───────────────────────────────────────────────────────
create or replace function public.purge_expired_enrollments()
returns int
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.courtside_enrollments
     where consumed_at is null and expires_at < now() - interval '1 day'
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke all on function public.purge_expired_enrollments() from anon, authenticated, public;
grant execute on function public.purge_expired_enrollments() to service_role;

-- ── 5. boundary sentinel ──────────────────────────────────────────────────
-- Discovered by name by klimr_readiness() (0223), so it is wired in by being
-- named correctly rather than by remembering to add it to a list.
create or replace function public.courtside_enrollment_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the public roles cannot read secrets
    not has_table_privilege('authenticated', 'public.courtside_enrollments', 'SELECT')
    and not has_table_privilege('anon', 'public.courtside_enrollments', 'SELECT')
    -- registration is service-role only and takes a secret hash, not a join code
    and not has_function_privilege('authenticated',
          'public.courtside_register(uuid, text, text, text, text)', 'EXECUTE')
    -- no consumed secret may ever be reusable
    and not exists (
      select 1 from public.courtside_enrollments
       where consumed_at is not null and consumed_install is null
    );
$$;

revoke all on function public.courtside_enrollment_intact() from anon, authenticated, public;
grant execute on function public.courtside_enrollment_intact() to service_role;

-- ── 6. the readiness count is part of the contract ────────────────────────
-- klimr_ready() asserts a COUNT as well as a pass, because a check that is
-- DROPPED does not fail — it vanishes, and an empty list has nothing failing in
-- it (0223). Adding a sentinel therefore means bumping the floor in the same
-- migration; tests/doc-claims.test.ts fails the build if the two disagree.
create or replace function public.klimr_ready(p_min_checks integer default 17)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
