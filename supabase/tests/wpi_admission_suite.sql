-- wpi_admission_suite.sql — KFU-011 + KFU-012, executed as real members.
-- Pins: person-mode capacity decided for the PARTY under the one lock; exact-
-- reject roster semantics (duplicates and non-members raise with reasons, the
-- seated count is asserted); and the queue approval as one locked CAS command —
-- terminal statuses terminal, the 0267 epoch unable to re-place a resolved
-- request, authorization inside the command. Every scenario here was first
-- reproduced FAILING on the pre-0292/0293 head (2026-08-18).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id,email) values
 ('e6000000-0000-4000-8000-0000000000a1','wpis-org@test.local'),
 ('e6000000-0000-4000-8000-0000000000c1','wpis-captain@test.local'),
 ('e6000000-0000-4000-8000-0000000000a2','wpis-m2@test.local'),
 ('e6000000-0000-4000-8000-0000000000a3','wpis-m3@test.local'),
 ('e6000000-0000-4000-8000-0000000000a4','wpis-m4@test.local'),
 ('e6000000-0000-4000-8000-0000000000a5','wpis-m5@test.local'),
 ('e6000000-0000-4000-8000-0000000000e9','wpis-stranger@test.local')
on conflict (id) do nothing;
insert into public.profiles (id,display_name,date_of_birth,phone,home_zip,neighborhood,city,state)
select u.id,'WPIS '||right(u.id::text,2),'1990-01-01','+1424556'||right(u.id::text,4),'90066','Mar Vista','Los Angeles','CA'
from auth.users u where u.email like 'wpis-%'
on conflict (id) do update set date_of_birth=excluded.date_of_birth;

insert into public.teams (id,name,sport_key,created_by,max_size) values
 ('e6000000-0000-4000-8000-0000000000b1','WPIS Five','tennis','e6000000-0000-4000-8000-0000000000c1',8);
insert into public.team_members (team_id,user_id,role) values
 ('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-0000000000c1','owner'),
 ('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-0000000000a2','member'),
 ('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-0000000000a3','member'),
 ('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-0000000000a4','member'),
 ('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-0000000000a5','member');
insert into public.tournaments (id,owner_id,code,title,sport_key,entry_type,capacity,format_config) values
 ('e6000000-0000-4000-8000-0000000000dd','e6000000-0000-4000-8000-0000000000a1','WPIS-CAP4-01','WPIS Cap4','tennis','team',4,'{"capacity_unit":"person"}'::jsonb);

-- ── T1: a party larger than the cap is WAITLISTED, occupying zero seats ────
savepoint t1;
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000c1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.tournament_register_team(
  'e6000000-0000-4000-8000-0000000000dd', null, 'e6000000-0000-4000-8000-0000000000b1',
  '[{"user_id":"e6000000-0000-4000-8000-0000000000c1"},{"user_id":"e6000000-0000-4000-8000-0000000000a2"},{"user_id":"e6000000-0000-4000-8000-0000000000a3"},{"user_id":"e6000000-0000-4000-8000-0000000000a4"},{"user_id":"e6000000-0000-4000-8000-0000000000a5"}]'::jsonb,
  '{}'::jsonb, true, true) ->> 'status') = 'waitlisted'
  then 'ok   T1 five-person party against cap 4 is waitlisted'
  else 'T1 FAIL: five-party was not waitlisted' end;
reset role;
select case when (
  select count(*) from public.tournament_registration_players rp
    join public.tournament_registrations r on r.id = rp.registration_id
   where r.tournament_id = 'e6000000-0000-4000-8000-0000000000dd'
     and rp.is_reserve = false
     and r.status not in ('withdrawn','declined','cancelled','disqualified','waitlisted')
) = 0 then 'ok   T1 waitlisted party occupies zero active seats'
  else 'T1 FAIL: waitlisted party consumed seats' end;
rollback to t1;

-- ── T2: a party equal to the cap is PENDING with exact seats ───────────────
savepoint t2;
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000c1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.tournament_register_team(
  'e6000000-0000-4000-8000-0000000000dd', null, 'e6000000-0000-4000-8000-0000000000b1',
  '[{"user_id":"e6000000-0000-4000-8000-0000000000c1"},{"user_id":"e6000000-0000-4000-8000-0000000000a2"},{"user_id":"e6000000-0000-4000-8000-0000000000a3"},{"user_id":"e6000000-0000-4000-8000-0000000000a4"}]'::jsonb,
  '{}'::jsonb, true, true)) ->> 'status' = 'pending'
  then 'ok   T2 four-person party against cap 4 admits as pending'
  else 'T2 FAIL: exact-cap party not pending' end;
reset role;
select case when (
  select count(*) from public.tournament_registration_players rp
    join public.tournament_registrations r on r.id = rp.registration_id
   where r.tournament_id = 'e6000000-0000-4000-8000-0000000000dd'
     and rp.is_reserve = false
     and r.status not in ('withdrawn','declined','cancelled','disqualified','waitlisted')
) = 4 then 'ok   T2 exactly four active seats taken'
  else 'T2 FAIL: active seat count wrong' end;
rollback to t2;

-- ── T3: a non-member in the roster raises with the offending id ────────────
savepoint t3;
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000c1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
do $$ begin
  perform public.tournament_register_team(
    'e6000000-0000-4000-8000-0000000000dd', null, 'e6000000-0000-4000-8000-0000000000b1',
    '[{"user_id":"e6000000-0000-4000-8000-0000000000c1"},{"user_id":"e6000000-0000-4000-8000-0000000000e9"}]'::jsonb,
    '{}'::jsonb, true, true);
  raise exception 'T3 FAIL: stranger was accepted';
exception when others then
  if sqlerrm like 'roster_not_team_member: e6000000-0000-4000-8000-0000000000e9%'
    then raise notice 'ok   T3 non-member raises and names the id';
    else raise; end if;
end $$;
reset role;
select case when not exists (
  select 1 from public.tournament_registrations
   where tournament_id = 'e6000000-0000-4000-8000-0000000000dd')
  then 'ok   T3 nothing was written on the rejection'
  else 'T3 FAIL: a rejected roster left rows behind' end;
rollback to t3;

-- ── T4: a duplicated roster entry raises ───────────────────────────────────
savepoint t4;
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000c1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
do $$ begin
  perform public.tournament_register_team(
    'e6000000-0000-4000-8000-0000000000dd', null, 'e6000000-0000-4000-8000-0000000000b1',
    '[{"user_id":"e6000000-0000-4000-8000-0000000000a2"},{"user_id":"e6000000-0000-4000-8000-0000000000a2"}]'::jsonb,
    '{}'::jsonb, true, true);
  raise exception 'T4 FAIL: duplicate roster accepted';
exception when others then
  if sqlerrm = 'roster_duplicate'
    then raise notice 'ok   T4 duplicate roster entry raises';
    else raise; end if;
end $$;
reset role;
rollback to t4;

-- ── Q1..Q4: queue approval — atomic, terminal, epoch-proof, authorized ─────
insert into public.court_sessions (id,code,organizer_id,sport_key) values
 ('e6000000-0000-4000-8000-0000000000f1','WPIS-Q-0001','e6000000-0000-4000-8000-0000000000a1','tennis');
insert into public.queue_courts (id,session_id,label,team_size) values
 ('e6000000-0000-4000-8000-0000000000c9','e6000000-0000-4000-8000-0000000000f1','Court 1',2);
insert into public.queue_join_requests (id,session_id,court_id,user_id,status) values
 ('e6000000-0000-4000-8000-0000000000a9','e6000000-0000-4000-8000-0000000000f1','e6000000-0000-4000-8000-0000000000c9','e6000000-0000-4000-8000-0000000000a2','pending');

select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.queue_resolve_join_request('e6000000-0000-4000-8000-0000000000a9', true)) ->> 'ok' = 'true'
  then 'ok   Q1 approve places and resolves in one transaction'
  else 'Q1 FAIL: approve did not succeed' end;
reset role;
select case when (select status from public.queue_join_requests where id='e6000000-0000-4000-8000-0000000000a9') = 'approved'
        and (select count(*) from public.queue_team_members where user_id='e6000000-0000-4000-8000-0000000000a2') = 1
  then 'ok   Q1 seated and approved together'
  else 'Q1 FAIL: split state survived' end;

select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.queue_resolve_join_request('e6000000-0000-4000-8000-0000000000a9', false)) ->> 'error' = 'already_handled'
  then 'ok   Q2 deny after approve is refused — no denied-while-seated'
  else 'Q2 FAIL: deny overwrote an approval' end;
reset role;

update public.queue_teams set status='done' where session_id='e6000000-0000-4000-8000-0000000000f1';
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.queue_resolve_join_request('e6000000-0000-4000-8000-0000000000a9', true)) ->> 'error' = 'already_handled'
  then 'ok   Q3 epoch replay refused — a resolved request cannot re-place'
  else 'Q3 FAIL: epoch re-approve went through' end;
reset role;
select case when (select count(distinct team_id) from public.queue_team_members where user_id='e6000000-0000-4000-8000-0000000000a2') = 1
  then 'ok   Q3 exactly one placement ever, from one request'
  else 'Q3 FAIL: double placement' end;

select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-0000000000a2', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
do $$ begin
  perform public.queue_resolve_join_request('e6000000-0000-4000-8000-0000000000a9', true);
  raise exception 'Q4 FAIL: non-organizer was allowed to resolve';
exception when others then
  if sqlerrm like '%not_organizer%' or sqlerrm like '%already_handled%'
    then raise notice 'ok   Q4 non-organizer cannot resolve requests';
    else raise; end if;
end $$;
reset role;

rollback;
