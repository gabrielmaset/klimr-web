-- match_visibility_suite.sql — the match discovery ladder, executed AS REAL
-- MEMBERS in every role of the relationship matrix, plus the adult gate.
-- Exists because 0270 rebuilt the matches read policy: the old 0001 policy
-- showed every open match to everyone and hid scheduled matches from
-- non-participants; the new one honors the owner's visibility choice and
-- covers scheduled matches. Each cell of the matrix is pinned here so a
-- future policy edit that flips one cannot pass replay.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-0000000000a0','mvs-organizer@test.local'),
  ('a1000000-0000-0000-0000-0000000000a1','mvs-friend@test.local'),
  ('a1000000-0000-0000-0000-0000000000a2','mvs-follower@test.local'),
  ('a1000000-0000-0000-0000-0000000000a3','mvs-stranger@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth, phone, home_zip, neighborhood, city, state) values
  ('a1000000-0000-0000-0000-0000000000a0','MVS Organizer','1990-01-01','+13105550370','90066','Mar Vista','Los Angeles','CA'),
  ('a1000000-0000-0000-0000-0000000000a1','MVS Friend','1990-01-01','+13105550371','90066','Mar Vista','Los Angeles','CA'),
  ('a1000000-0000-0000-0000-0000000000a2','MVS Follower','1990-01-01','+13105550372','90066','Mar Vista','Los Angeles','CA'),
  ('a1000000-0000-0000-0000-0000000000a3','MVS Stranger','1990-01-01','+13105550373','90066','Mar Vista','Los Angeles','CA')
on conflict (id) do update set display_name = excluded.display_name,
  date_of_birth = excluded.date_of_birth, phone = excluded.phone, home_zip = excluded.home_zip,
  neighborhood = excluded.neighborhood, city = excluded.city, state = excluded.state;

insert into public.sports (key, name, skill_system) values ('mvs-sport','MVS Sport','Level')
on conflict (key) do nothing;
insert into public.sport_formats (sport_key, format_key, label, short_label, players_per_side, sides, total_players, is_default, is_casual, sort)
values ('mvs-sport','singles','Singles','1v1',1,2,2,true,false,1)
on conflict do nothing;

insert into public.friendships (requester_id, addressee_id, status) values
  ('a1000000-0000-0000-0000-0000000000a1','a1000000-0000-0000-0000-0000000000a0','accepted')
on conflict do nothing;
insert into public.follows (follower_id, followee_id) values
  ('a1000000-0000-0000-0000-0000000000a2','a1000000-0000-0000-0000-0000000000a0')
on conflict do nothing;

insert into public.matches (id, sport_key, format, organizer_id, total_slots, status, visibility, skill_min, skill_max) values
  ('a2000000-0000-0000-0000-0000000000b0','mvs-sport','singles','a1000000-0000-0000-0000-0000000000a0',2,'open','public','casual','advanced'),
  ('a2000000-0000-0000-0000-0000000000b1','mvs-sport','singles','a1000000-0000-0000-0000-0000000000a0',2,'open','followers',null,null),
  ('a2000000-0000-0000-0000-0000000000b2','mvs-sport','singles','a1000000-0000-0000-0000-0000000000a0',2,'open','friends',null,null),
  ('a2000000-0000-0000-0000-0000000000b3','mvs-sport','singles','a1000000-0000-0000-0000-0000000000a0',2,'scheduled','public',null,null),
  ('a2000000-0000-0000-0000-0000000000b4','mvs-sport','singles','a1000000-0000-0000-0000-0000000000a0',2,'completed','public',null,null)
on conflict (id) do nothing;

-- ── the matrix, one role at a time ──────────────────────────────────────────

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select case when (select count(*) from public.matches m
                   where m.organizer_id = 'a1000000-0000-0000-0000-0000000000a0'
                     and m.id in ('a2000000-0000-0000-0000-0000000000b0','a2000000-0000-0000-0000-0000000000b1','a2000000-0000-0000-0000-0000000000b2')) = 3
  then 'ok   MATRIX friend sees public, followers and friends matches'
  else 'MATCH-VIS friend does not see all three ladder levels' end;

reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select case when (select count(*) from public.matches m
                   where m.id in ('a2000000-0000-0000-0000-0000000000b0','a2000000-0000-0000-0000-0000000000b1')) = 2
  then 'ok   MATRIX follower sees public and followers matches'
  else 'MATCH-VIS follower does not see public plus followers' end;
select case when not exists (select 1 from public.matches m where m.id = 'a2000000-0000-0000-0000-0000000000b2')
  then 'ok   MATRIX follower cannot see a friends-only match'
  else 'MATCH-VIS follower can see a friends-only match' end;

reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select case when (select count(*) from public.matches m
                   where m.id in ('a2000000-0000-0000-0000-0000000000b0','a2000000-0000-0000-0000-0000000000b1','a2000000-0000-0000-0000-0000000000b2')) = 1
  then 'ok   MATRIX stranger sees only the public match'
  else 'MATCH-VIS stranger count is not exactly one' end;
select case when exists (select 1 from public.matches m where m.id = 'a2000000-0000-0000-0000-0000000000b3')
  then 'ok   MATRIX scheduled public match is discoverable (0270 deliberate change)'
  else 'MATCH-VIS scheduled public match hidden from stranger' end;
select case when not exists (select 1 from public.matches m where m.id = 'a2000000-0000-0000-0000-0000000000b4')
  then 'ok   MATRIX completed match is not discoverable by a stranger'
  else 'MATCH-VIS completed match leaked to a stranger' end;

reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a0', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select case when (select count(*) from public.matches m
                   where m.id in ('a2000000-0000-0000-0000-0000000000b0','a2000000-0000-0000-0000-0000000000b1',
                                  'a2000000-0000-0000-0000-0000000000b2','a2000000-0000-0000-0000-0000000000b3',
                                  'a2000000-0000-0000-0000-0000000000b4')) = 5
  then 'ok   MATRIX organizer sees every own match regardless of status or ladder'
  else 'MATCH-VIS organizer cannot see all own matches' end;

reset role;

-- ── skill columns: shape rules hold ─────────────────────────────────────────

do $$
begin
  begin
    update public.matches set skill_min = 'advanced', skill_max = 'casual'
     where id = 'a2000000-0000-0000-0000-0000000000b0';
    raise exception 'MATCH-VIS skill order check accepted min above max';
  exception when check_violation then null;
  end;
end $$;
select 'ok   SKILL order constraint rejects min above max';

do $$
begin
  begin
    update public.matches set skill_min = 'pro'
     where id = 'a2000000-0000-0000-0000-0000000000b0';
    raise exception 'MATCH-VIS skill vocabulary check accepted an unknown level';
  exception when check_violation then null;
  end;
end $$;
select 'ok   SKILL vocabulary constraint rejects unknown levels';

-- ── the adult gate (0271) ───────────────────────────────────────────────────

do $$
begin
  begin
    insert into auth.users (id, email)
    values ('a1000000-0000-0000-0000-0000000000a9','mvs-minor@test.local')
    on conflict (id) do nothing;
    insert into public.profiles (id, display_name, date_of_birth, phone, home_zip, neighborhood, city, state)
    values ('a1000000-0000-0000-0000-0000000000a9','MVS Minor', (current_date - interval '17 years')::date,
            '+13105550379','90066','Mar Vista','Los Angeles','CA')
    on conflict (id) do update set date_of_birth = excluded.date_of_birth;
    raise exception 'ADULT gate failed: a minor birth date was accepted';
  exception when others then
    if sqlerrm <> 'must_be_18' then raise; end if;
  end;
end $$;
select 'ok   ADULT trigger rejects a minor birth date on insert';

do $$
begin
  begin
    update public.profiles set date_of_birth = (current_date - interval '16 years')::date
     where id = 'a1000000-0000-0000-0000-0000000000a3';
    raise exception 'ADULT gate failed: a minor birth date was accepted on update';
  exception when others then
    if sqlerrm <> 'must_be_18' then raise; end if;
  end;
end $$;
select 'ok   ADULT trigger rejects a minor birth date on update';

select case when (select date_of_birth from public.profiles where id = 'a1000000-0000-0000-0000-0000000000a3') = '1990-01-01'
  then 'ok   ADULT rejected update left the original birth date intact'
  else 'ADULT rejected update mutated the row' end;


-- ── 0272: the leaderboard filters, as real members ──────────────────────────
reset role;
update public.profiles set gender = 'woman' where id in ('a1000000-0000-0000-0000-0000000000a0','a1000000-0000-0000-0000-0000000000a2');
update public.profiles set gender = 'man'   where id in ('a1000000-0000-0000-0000-0000000000a1','a1000000-0000-0000-0000-0000000000a3');
update public.profiles set date_of_birth = (current_date - interval '22 years')::date where id = 'a1000000-0000-0000-0000-0000000000a2';
insert into public.player_sports (user_id, sport_key, points, skill_level, last_result_at, active) values
  ('a1000000-0000-0000-0000-0000000000a0','mvs-sport',400,'advanced', now(), true),
  ('a1000000-0000-0000-0000-0000000000a1','mvs-sport',300,'competitive', now(), true),
  ('a1000000-0000-0000-0000-0000000000a2','mvs-sport',200,'casual', now(), true),
  ('a1000000-0000-0000-0000-0000000000a3','mvs-sport',100,'new', now(), true)
on conflict (user_id, sport_key) do update set points = excluded.points, last_result_at = excluded.last_result_at, active = true;
insert into public.blocks (blocker_id, blocked_id) values
  ('a1000000-0000-0000-0000-0000000000a3','a1000000-0000-0000-0000-0000000000a0')
on conflict do nothing;

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select case when (select count(*) from public.ranked_players('mvs-sport')) = 4
        and (select rank from public.ranked_players('mvs-sport') r where r.user_id = 'a1000000-0000-0000-0000-0000000000a0') = 1
  then 'ok   BOARD full board ranks four players by points'
  else 'MATCH-BOARD full board shape wrong' end;

select case when (select count(*) from public.ranked_players('mvs-sport', 'world', null, 'woman')) = 2
        and not exists (select 1 from public.ranked_players('mvs-sport', 'world', null, 'woman') r
                         where r.user_id = 'a1000000-0000-0000-0000-0000000000a1')
  then 'ok   BOARD gender filter isolates the right players'
  else 'MATCH-BOARD gender filter wrong' end;

select case when (select count(*) from public.ranked_players('mvs-sport', 'world', null, null, 18, 24)) = 1
        and exists (select 1 from public.ranked_players('mvs-sport', 'world', null, null, 18, 24) r
                     where r.user_id = 'a1000000-0000-0000-0000-0000000000a2')
  then 'ok   BOARD age bracket 18 to 24 picks exactly the 22 year old'
  else 'MATCH-BOARD age bracket wrong' end;

select case when (select count(*) from public.ranked_players('mvs-sport', 'world', null, null, 65, null)) = 0
  then 'ok   BOARD age bracket 65 plus is empty for this field'
  else 'MATCH-BOARD open ended bracket wrong' end;

select case when (select min(r.rank) from public.ranked_players('mvs-sport', 'world', null, null, null, null, 2, 2) r) = 3
        and (select count(*) from public.ranked_players('mvs-sport', 'world', null, null, null, null, 2, 2)) = 2
  then 'ok   BOARD window carries true global ranks'
  else 'MATCH-BOARD window ranks wrong' end;

reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select case when not exists (select 1 from public.ranked_players('mvs-sport') r
                              where r.user_id = 'a1000000-0000-0000-0000-0000000000a0')
        and (select count(*) from public.ranked_players('mvs-sport')) = 3
  then 'ok   BOARD blocked pair is excluded from the blocker viewer board'
  else 'MATCH-BOARD block exclusion missing' end;

reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select case when exists (select 1 from public.ranked_players('mvs-sport') r
                          where r.user_id = 'a1000000-0000-0000-0000-0000000000a0')
  then 'ok   BOARD unrelated viewer still sees the blocked player'
  else 'MATCH-BOARD block exclusion leaked to third parties' end;

reset role;

rollback;
