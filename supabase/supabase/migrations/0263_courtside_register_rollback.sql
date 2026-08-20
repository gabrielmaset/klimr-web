-- 0263_courtside_register_rollback.sql — restores Courtside display registration.
--
-- INCIDENT ROLLBACK, 2026-08-11. Paste this and deploy the matching app build
-- together; neither works alone.
--
-- WHAT BROKE. KRA-001 changed device enrollment from "present the session code"
-- to "present a one-time secret the organizer issued". That is three coupled
-- pieces: the client (`lib/courtside-install.ts`), the route
-- (`app/api/courtside/register/route.ts`), and this function's signature. 0235
-- DROPPED the `p_code` form and created the `p_secret_hash` form, so once 0235
-- was applied the database accepted only the new shape.
--
-- The pieces went out of step, and every Courtside display reported "This display
-- isn't registered yet" — `ensureDeviceToken()` received a failure, returned
-- null, and the display could no longer record a result. The queue kept rendering,
-- which is why it looked like a display bug rather than a registration one.
--
-- WHY ROLL BACK RATHER THAN FINISH THE FEATURE. Going forward needs UI that does
-- not exist yet: the display has no field for an enrollment code, because until
-- 0235 the session code WAS the enrollment. Building that under an outage is how
-- a second defect gets shipped on top of the first. Rolling back is one function
-- and restores service now; KRA-001 then ships once, whole, with the client and
-- the display UI in the same change.
--
-- WHAT THIS COSTS, STATED PLAINLY. **KRA-001 is open again**: the public join code
-- can mint a Courtside operator token. That was true for the entire life of the
-- product before this remediation, so the system is no worse than it was last
-- week — but it is not fixed, and the disposition register says so.
--
-- WHAT IS DELIBERATELY KEPT. `courtside_enrollments`, `courtside_issue_enrollment`
-- and the organizer's "Get a display code" button stay. They are inert without a
-- client that uses them, they cost nothing, and they are most of the work for
-- shipping KRA-001 properly.

-- Drop the secret-hash form FIRST. Leaving both would create two functions with
-- the same name and identical argument TYPES (uuid, text, text, text, text) —
-- PostgREST would resolve by argument NAME, and which one answers becomes a
-- function of the caller rather than of policy. 0243 and 0214 both record what
-- happens when a vulnerable overload survives beside its replacement.
drop function if exists public.courtside_register(uuid, text, text, text, text);

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
declare v_session uuid;
begin
  -- Either the join code or the display code identifies the session, matching
  -- the pre-0235 behaviour the deployed clients expect.
  select s.id into v_session
    from public.court_sessions s
   where (upper(s.code) = upper(p_code)
          or upper(coalesce(s.display_code, '')) = upper(p_code))
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
        token_hash    = excluded.token_hash,
        platform      = coalesce(excluded.platform, public.courtside_devices.platform),
        app_version   = coalesce(excluded.app_version, public.courtside_devices.app_version),
        registered_at = now(),
        -- NOTE, and it is the other half of KRA-001: clearing this lets a revoked
        -- device re-register itself with the same public code. That is the known
        -- cost of the rollback, recorded here so it is not rediscovered as a
        -- surprise. The enrollment-secret design fixes it because re-registering
        -- would require a secret the organizer issued after the revocation.
        revoked_at    = null,
        last_seen_at  = now();
  return true;
end; $$;

revoke all on function public.courtside_register(uuid, text, text, text, text) from anon, authenticated, public;
grant execute on function public.courtside_register(uuid, text, text, text, text) to service_role;

comment on function public.courtside_register is
  'ROLLED BACK 2026-08-11 to the pre-0235 join/display-code form to restore Courtside registration. '
  'KRA-001 (public code mints an operator token) is OPEN until the client, this function and the '
  'display UI ship together.';

-- The 0235 sentinel asserted the hardened shape and would now fail the readiness
-- gate on a correctly-rolled-back database. Redefined to assert what is true and
-- still worth guaranteeing: the enrollment machinery is intact and unreachable by
-- members, and registration remains server-only.
create or replace function public.courtside_enrollment_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not has_table_privilege('authenticated', 'public.courtside_enrollments', 'SELECT')
    and not has_table_privilege('anon', 'public.courtside_enrollments', 'SELECT')
    and not has_function_privilege('authenticated',
          'public.courtside_register(uuid, text, text, text, text)', 'EXECUTE')
    and not exists (
      select 1 from public.courtside_enrollments
       where consumed_at is not null and consumed_install is null
    );
$$;

revoke all on function public.courtside_enrollment_intact() from anon, authenticated, public;
grant execute on function public.courtside_enrollment_intact() to service_role;

select public.journal_migration('0263', '0263_courtside_register_rollback.sql', null,
  'Incident rollback: restores pre-0235 Courtside registration. KRA-001 reopened.');
