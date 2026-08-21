-- teams_suite.sql — D-40 joinability and D-41 belts, executed AS REAL MEMBERS.
-- Pins: the per-team join policy (open vs friends-of-owner), idempotent asks,
-- the roster rule being STRICTER than the challenge rule (staff may propose
-- matches but may not seat members), capacity under the team lock, and the
-- team_matches guard (same sport at insert; away-side-only acceptance; the
-- transition matrix).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('b1000000-0000-0000-0000-0000000000b0','tjs-owner-a@test.local'),
  ('b1000000-0000-0000-0000-0000000000b1','tjs-friend@test.local'),
  ('b1000000-0000-0000-0000-0000000000b2','tjs-stranger@test.local'),
  ('b1000000-0000-0000-0000-0000000000b3','tjs-staff@test.local'),
  ('b1000000-0000-0000-0000-0000000000b4','tjs-owner-c@test.local'),
  ('b1000000-0000-0000-0000-0000000000b5','tjs-late@test.local'),
  ('b1000000-0000-0000-0000-0000000000b8','tjs-owner-b@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth, phone, home_zip, neighborhood, city, state) values
  ('b1000000-0000-0000-0000-0000000000b0','TJS OwnerA','1990-01-01','+13105550380','90066','Mar Vista','Los Angeles','CA'),
  ('b1000000-0000-0000-0000-0000000000b1','TJS Friend','1990-01-01','+13105550381','90066','Mar Vista','Los Angeles','CA'),
  ('b1000000-0000-0000-0000-0000000000b2','TJS Stranger','1990-01-01','+13105550382','90066','Mar Vista','Los Angeles','CA'),
  ('b1000000-0000-0000-0000-0000000000b3','TJS Staff','1990-01-01','+13105550383','90066','Mar Vista','Los Angeles','CA'),
  ('b1000000-0000-0000-0000-0000000000b4','TJS OwnerC','1990-01-01','+13105550384','90066','Mar Vista','Los Angeles','CA'),
  ('b1000000-0000-0000-0000-0000000000b5','TJS Late','1990-01-01','+13105550385','90066','Mar Vista','Los Angeles','CA'),
  ('b1000000-0000-0000-0000-0000000000b8','TJS OwnerB','1990-01-01','+13105550388','90066','Mar Vista','Los Angeles','CA')
on conflict (id) do update set display_name = excluded.display_name,
  date_of_birth = excluded.date_of_birth, phone = excluded.phone, home_zip = excluded.home_zip,
  neighborhood = excluded.neighborhood, city = excluded.city, state = excluded.state;

insert into public.sports (key, name, skill_system) values
  ('tjs-sport-a','TJS Sport A','Level'),
  ('tjs-sport-b','TJS Sport B','Level')
on conflict (key) do nothing;

insert into public.teams (id, name, sport_key, created_by, max_size, join_policy) values
  ('b2000000-0000-0000-0000-0000000000c0','TJS Open',   'tjs-sport-a','b1000000-0000-0000-0000-0000000000b0',4,'open'),
  ('b2000000-0000-0000-0000-0000000000c1','TJS Friends','tjs-sport-a','b1000000-0000-0000-0000-0000000000b8',5,'friends'),
  ('b2000000-0000-0000-0000-0000000000c2','TJS Other',  'tjs-sport-b','b1000000-0000-0000-0000-0000000000b4',5,'open')
on conflict (id) do nothing;
insert into public.team_members (team_id, user_id, role) values
  ('b2000000-0000-0000-0000-0000000000c0','b1000000-0000-0000-0000-0000000000b0','owner'),
  ('b2000000-0000-0000-0000-0000000000c0','b1000000-0000-0000-0000-0000000000b3','staff'),
  ('b2000000-0000-0000-0000-0000000000c1','b1000000-0000-0000-0000-0000000000b8','owner'),
  ('b2000000-0000-0000-0000-0000000000c2','b1000000-0000-0000-0000-0000000000b4','owner')
on conflict do nothing;
insert into public.friendships (requester_id, addressee_id, status) values
  ('b1000000-0000-0000-0000-0000000000b1','b1000000-0000-0000-0000-0000000000b8','accepted')
on conflict do nothing;

-- ── the ask flow, as real members ───────────────────────────────────────────

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select case when public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c0') is not null
  then 'ok   TEAM open team accepts a stranger ask'
  else 'TEAM-JOIN open ask returned null' end;

select case when public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c0')
          = (select r.id from public.team_join_requests r
              where r.team_id = 'b2000000-0000-0000-0000-0000000000c0'
                and r.requester_id = 'b1000000-0000-0000-0000-0000000000b2'
                and r.status = 'pending')
  then 'ok   TEAM duplicate ask returns the same pending id'
  else 'TEAM-JOIN duplicate ask minted a second request' end;

do $$
begin
  begin
    perform public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c1');
    raise exception 'TEAM-JOIN friends only team accepted a stranger';
  exception when others then
    if sqlerrm <> 'friends_only_team' then raise; end if;
  end;
end $$;
select 'ok   TEAM friends-only team refuses a stranger ask';

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select case when public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c1') is not null
  then 'ok   TEAM friends-only team accepts an owner friend'
  else 'TEAM-JOIN friend ask failed' end;

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
begin
  begin
    perform public.team_resolve_join_request(
      (select r.id from public.team_join_requests r
        where r.team_id = 'b2000000-0000-0000-0000-0000000000c0'
          and r.requester_id = 'b1000000-0000-0000-0000-0000000000b2' and r.status = 'pending'), true);
    raise exception 'TEAM-JOIN a non manager approved a request';
  exception when others then
    if sqlerrm <> 'not_a_manager' then raise; end if;
  end;
end $$;
select 'ok   TEAM non-manager cannot resolve a request';

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
begin
  begin
    perform public.team_resolve_join_request(
      (select r.id from public.team_join_requests r
        where r.team_id = 'b2000000-0000-0000-0000-0000000000c0'
          and r.requester_id = 'b1000000-0000-0000-0000-0000000000b2' and r.status = 'pending'), true);
    raise exception 'TEAM-JOIN staff seated a member: roster rule must be stricter than challenge rule';
  exception when others then
    if sqlerrm <> 'not_a_manager' then raise; end if;
  end;
end $$;
select 'ok   TEAM staff may not seat members (roster rule stricter than challenge rule)';

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b0', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select public.team_resolve_join_request(
  (select r.id from public.team_join_requests r
    where r.team_id = 'b2000000-0000-0000-0000-0000000000c0'
      and r.requester_id = 'b1000000-0000-0000-0000-0000000000b2' and r.status = 'pending'), true);
select case when exists (select 1 from public.team_members m
                          where m.team_id = 'b2000000-0000-0000-0000-0000000000c0'
                            and m.user_id = 'b1000000-0000-0000-0000-0000000000b2' and m.role = 'member')
  then 'ok   TEAM approval seats the requester as a member'
  else 'TEAM-JOIN approval did not create membership' end;

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  begin
    perform public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c0');
    raise exception 'TEAM-JOIN a member could ask again';
  exception when others then
    if sqlerrm <> 'already_member' then raise; end if;
  end;
end $$;
select 'ok   TEAM a seated member cannot ask again';

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b5', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c0');
reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b0', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.team_resolve_join_request(
  (select r.id from public.team_join_requests r
    where r.team_id = 'b2000000-0000-0000-0000-0000000000c0'
      and r.requester_id = 'b1000000-0000-0000-0000-0000000000b5' and r.status = 'pending'), true);
reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  begin
    perform public.team_ask_to_join('b2000000-0000-0000-0000-0000000000c0');
    raise exception 'TEAM-JOIN a full team accepted an ask';
  exception when others then
    if sqlerrm <> 'team_full' then raise; end if;
  end;
end $$;
select 'ok   TEAM a full roster refuses new asks';

select public.team_withdraw_join_request(
  (select r.id from public.team_join_requests r
    where r.team_id = 'b2000000-0000-0000-0000-0000000000c1'
      and r.requester_id = 'b1000000-0000-0000-0000-0000000000b1' and r.status = 'pending'));
select case when (select r.status from public.team_join_requests r
                   where r.team_id = 'b2000000-0000-0000-0000-0000000000c1'
                     and r.requester_id = 'b1000000-0000-0000-0000-0000000000b1') = 'withdrawn'
  then 'ok   TEAM requester can withdraw a pending ask'
  else 'TEAM-JOIN withdraw did not mark the request' end;

-- ── the challenge belts, as direct table writes ─────────────────────────────

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b0', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
begin
  begin
    insert into public.team_matches (sport_key, home_team_id, away_team_id, proposed_by, status)
    values ('tjs-sport-a','b2000000-0000-0000-0000-0000000000c0','b2000000-0000-0000-0000-0000000000c2',
            'b1000000-0000-0000-0000-0000000000b0','proposed');
    raise exception 'TEAM-BELT cross sport challenge was accepted';
  exception when others then
    if sqlerrm <> 'sport_mismatch' then raise; end if;
  end;
end $$;
select 'ok   BELT cross-sport challenge is refused at the database';

insert into public.team_matches (id, sport_key, home_team_id, away_team_id, proposed_by, status)
values ('b3000000-0000-0000-0000-0000000000d0','tjs-sport-a',
        'b2000000-0000-0000-0000-0000000000c0','b2000000-0000-0000-0000-0000000000c1',
        'b1000000-0000-0000-0000-0000000000b0','proposed');
select 'ok   BELT a valid same-sport proposal inserts';

do $$
begin
  begin
    update public.team_matches set status = 'scheduled'
     where id = 'b3000000-0000-0000-0000-0000000000d0';
    raise exception 'TEAM-BELT the home side accepted its own challenge';
  exception when others then
    if sqlerrm <> 'away_managers_only' then raise; end if;
  end;
end $$;
select 'ok   BELT home managers cannot accept their own challenge';

reset role;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-0000000000b8', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

update public.team_matches set status = 'scheduled', decided_at = now()
 where id = 'b3000000-0000-0000-0000-0000000000d0';
select case when (select status from public.team_matches where id = 'b3000000-0000-0000-0000-0000000000d0') = 'scheduled'
  then 'ok   BELT the away side accepts and the match schedules'
  else 'TEAM-BELT away acceptance failed' end;

do $$
begin
  begin
    update public.team_matches set status = 'completed'
     where id = 'b3000000-0000-0000-0000-0000000000d0';
    raise exception 'TEAM-BELT completed without scores';
  exception when others then
    if sqlerrm <> 'scores_required' then raise; end if;
  end;
end $$;
select 'ok   BELT completion requires both scores';

do $$
begin
  begin
    update public.team_matches set status = 'proposed'
     where id = 'b3000000-0000-0000-0000-0000000000d0';
    raise exception 'TEAM-BELT a backwards transition was accepted';
  exception when others then
    if sqlerrm <> 'bad_transition' then raise; end if;
  end;
end $$;
select 'ok   BELT backwards transitions are refused';

rollback;
