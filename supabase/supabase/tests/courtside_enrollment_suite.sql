-- courtside_enrollment_suite.sql — KFU-001 closure matrix.
-- The audit's required proof: join code, display code, arbitrary installation
-- id, expired challenge, reused challenge, revoked challenge, wrong session,
-- and replay must ALL fail; only a fresh organizer-issued challenge may enroll,
-- and only for the court it was issued for. Includes a non-zero baseline so the
-- suite cannot pass by measuring nothing.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-0000000000a1','cs-organizer@test.local'),
  ('ee000000-0000-0000-0000-0000000000a2','cs-stranger@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  ('ee000000-0000-0000-0000-0000000000a1','CS Organizer'),
  ('ee000000-0000-0000-0000-0000000000a2','CS Stranger')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.sports (key, name, skill_system) values ('cs-sport','CS Sport','Level')
on conflict (key) do nothing;

insert into public.court_sessions (id, code, display_code, organizer_id, title, sport_key, status)
values ('ee000000-0000-0000-0000-0000000000b1','CSJOIN1','CSDISP1',
        'ee000000-0000-0000-0000-0000000000a1','CS Session','cs-sport','live')
on conflict (id) do nothing;
insert into public.court_sessions (id, code, display_code, organizer_id, title, sport_key, status)
values ('ee000000-0000-0000-0000-0000000000b2','CSJOIN2','CSDISP2',
        'ee000000-0000-0000-0000-0000000000a1','CS Other','cs-sport','live')
on conflict (id) do nothing;

-- ── issuing authorization ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-0000000000a2',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
begin
  begin
    perform public.courtside_issue_enrollment('ee000000-0000-0000-0000-0000000000b1',
      encode(sha256(convert_to('stranger-secret','UTF8')),'hex'));
    raise exception 'CS-FAIL a non-organizer issued an enrollment challenge';
  exception when others then
    if sqlerrm <> 'not_organizer' then raise; end if;
  end;
end $$;
select 'ok   CS a non-organizer cannot issue an enrollment challenge';
reset role;

-- ── the public codes mint nothing ───────────────────────────────────────────
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000c1'::uuid,
         'CSJOIN1', encode(sha256(convert_to('tok1','UTF8')),'hex')) = false
  then 'ok   CS the public JOIN code enrolls nothing'
  else 'CS-FAIL join code minted a device' end;
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000c2'::uuid,
         'CSDISP1', encode(sha256(convert_to('tok2','UTF8')),'hex')) = false
  then 'ok   CS the public DISPLAY code enrolls nothing'
  else 'CS-FAIL display code minted a device' end;
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000c3'::uuid,
         'not-a-real-secret', encode(sha256(convert_to('tok3','UTF8')),'hex')) = false
  then 'ok   CS an invented secret enrolls nothing'
  else 'CS-FAIL arbitrary secret minted a device' end;
select case when (select count(*) from public.courtside_devices
                   where install_id in ('ee000000-0000-0000-0000-0000000000c1',
                                        'ee000000-0000-0000-0000-0000000000c2',
                                        'ee000000-0000-0000-0000-0000000000c3')) = 0
  then 'ok   CS no device rows exist after the public-code attempts'
  else 'CS-FAIL a device row was created by a public code' end;

-- ── the organizer issues, and the challenge works exactly once ──────────────
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.courtside_issue_enrollment('ee000000-0000-0000-0000-0000000000b1',
  encode(sha256(convert_to('good-secret-1','UTF8')),'hex'), 'Court 1 tablet') as issued_id;
reset role;

select case when public.courtside_register('ee000000-0000-0000-0000-0000000000c9'::uuid,
         'good-secret-1', encode(sha256(convert_to('tokgood','UTF8')),'hex')) = true
  then 'ok   CS BASELINE a fresh organizer-issued challenge DOES enroll (suite measures something)'
  else 'CS-FAIL the valid enrollment path failed' end;

select case when (select session_id from public.courtside_devices
                   where install_id = 'ee000000-0000-0000-0000-0000000000c9')
              = 'ee000000-0000-0000-0000-0000000000b1'
  then 'ok   CS the device is bound to the session the challenge named'
  else 'CS-FAIL device bound to the wrong session' end;

select case when public.courtside_register('ee000000-0000-0000-0000-0000000000ca'::uuid,
         'good-secret-1', encode(sha256(convert_to('tokreplay','UTF8')),'hex')) = false
  then 'ok   CS REPLAY the same challenge cannot enroll a second device'
  else 'CS-FAIL a consumed challenge was reused' end;

-- ── expiry ──────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.courtside_issue_enrollment('ee000000-0000-0000-0000-0000000000b1',
  encode(sha256(convert_to('expiring-secret','UTF8')),'hex')) as expiring;
reset role;
set local role service_role;
update public.courtside_enrollments set expires_at = now() - interval '1 minute'
 where secret_hash = encode(sha256(convert_to('expiring-secret','UTF8')),'hex');
reset role;
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000cb'::uuid,
         'expiring-secret', encode(sha256(convert_to('tokexp','UTF8')),'hex')) = false
  then 'ok   CS an EXPIRED challenge enrolls nothing'
  else 'CS-FAIL expired challenge was accepted' end;

-- ── organizer revocation of an unused challenge ─────────────────────────────
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
-- The organizer revokes using the id the issue call returned — the same value
-- the UI holds. Reading courtside_enrollments directly is denied to members by
-- design (server-only table), so the suite must not do it either.
do $$
declare v_id uuid;
begin
  v_id := public.courtside_issue_enrollment('ee000000-0000-0000-0000-0000000000b1',
            encode(sha256(convert_to('revoked-secret','UTF8')),'hex'));
  perform public.courtside_revoke_enrollment(v_id);
end $$;
reset role;
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000cc'::uuid,
         'revoked-secret', encode(sha256(convert_to('tokrev','UTF8')),'hex')) = false
  then 'ok   CS a REVOKED challenge enrolls nothing'
  else 'CS-FAIL revoked challenge was accepted' end;

-- ── operator scope: the token only authorizes its own session ───────────────
select case when public.courtside_authorize('ee000000-0000-0000-0000-0000000000c9'::uuid,
         encode(sha256(convert_to('tokgood','UTF8')),'hex'), 'ee000000-0000-0000-0000-0000000000b1'::uuid) = true
  then 'ok   CS the enrolled device is authorized for ITS session'
  else 'CS-FAIL valid device not authorized' end;
select case when public.courtside_authorize('ee000000-0000-0000-0000-0000000000c9'::uuid,
         encode(sha256(convert_to('tokgood','UTF8')),'hex'), 'ee000000-0000-0000-0000-0000000000b2'::uuid) = false
  then 'ok   CS SCOPE the device cannot operate a DIFFERENT session'
  else 'CS-FAIL device authorized across sessions' end;
select case when public.courtside_authorize('ee000000-0000-0000-0000-0000000000c9'::uuid,
         encode(sha256(convert_to('wrong-token','UTF8')),'hex'), 'ee000000-0000-0000-0000-0000000000b1'::uuid) = false
  then 'ok   CS a COPIED install id with the wrong token is refused'
  else 'CS-FAIL wrong token authorized' end;

-- ── revoking the DEVICE sticks until a new challenge is issued ──────────────
set local role service_role;
update public.courtside_devices set revoked_at = now()
 where install_id = 'ee000000-0000-0000-0000-0000000000c9';
reset role;
select case when public.courtside_authorize('ee000000-0000-0000-0000-0000000000c9'::uuid,
         encode(sha256(convert_to('tokgood','UTF8')),'hex'), 'ee000000-0000-0000-0000-0000000000b1'::uuid) = false
  then 'ok   CS a REVOKED device is no longer authorized'
  else 'CS-FAIL revoked device still authorized' end;
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000c9'::uuid,
         'CSJOIN1', encode(sha256(convert_to('tokreanimate','UTF8')),'hex')) = false
  then 'ok   CS REVOCATION STICKS: the public code cannot re-enroll a revoked device'
  else 'CS-FAIL revocation was undone by a public code' end;

-- ── ended sessions cannot enroll ────────────────────────────────────────────
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.courtside_issue_enrollment('ee000000-0000-0000-0000-0000000000b2',
  encode(sha256(convert_to('ended-secret','UTF8')),'hex')) as ended_one;
reset role;
set local role service_role;
update public.court_sessions set status = 'ended' where id = 'ee000000-0000-0000-0000-0000000000b2';
reset role;
select case when public.courtside_register('ee000000-0000-0000-0000-0000000000cd'::uuid,
         'ended-secret', encode(sha256(convert_to('tokended','UTF8')),'hex')) = false
  then 'ok   CS a challenge for an ENDED session enrolls nothing'
  else 'CS-FAIL ended session accepted an enrollment' end;

rollback;
