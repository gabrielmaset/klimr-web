-- bracket_generation_suite.sql — KCDX-046 residual, executed as staff.
-- Pins: the knockout graph born whole (rows, byes, bye advancement, links) in
-- one command; exact-reject seat validation; 0222's adjudication doctrine on
-- regeneration and clearing; draw numbering under the lock with structural
-- uniqueness; pool lifecycle through the same discipline. Every failing
-- scenario here was first reproduced on the pre-0294 head (2026-08-18).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id,email) values
 ('e8000000-0000-4000-8000-0000000000a1','bgs-owner@test.local'),
 ('e8000000-0000-4000-8000-0000000000a2','bgs-p1@test.local'),
 ('e8000000-0000-4000-8000-0000000000a3','bgs-p2@test.local'),
 ('e8000000-0000-4000-8000-0000000000a4','bgs-p3@test.local'),
 ('e8000000-0000-4000-8000-0000000000a5','bgs-p4@test.local')
on conflict (id) do nothing;
insert into public.profiles (id,display_name,date_of_birth,phone,home_zip,neighborhood,city,state)
select u.id,'BGS '||right(u.id::text,2),'1990-01-01','+1424558'||right(u.id::text,4),'90066','Mar Vista','Los Angeles','CA'
from auth.users u where u.email like 'bgs-%'
on conflict (id) do update set date_of_birth=excluded.date_of_birth;
insert into public.tournaments (id,owner_id,code,title,sport_key,entry_type) values
 ('e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000a1','BGS-0001','BGS Cup','tennis','individual');
insert into public.tournament_divisions (id,tournament_id,name) values
 ('e8000000-0000-4000-8000-0000000000d1','e8000000-0000-4000-8000-0000000000dd','Open');
insert into public.tournament_registrations (id,tournament_id,division_id,registrant_id,status,payment_status) values
 ('e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1','e8000000-0000-4000-8000-0000000000a2','confirmed','unpaid'),
 ('e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1','e8000000-0000-4000-8000-0000000000a3','confirmed','unpaid'),
 ('e8000000-0000-4000-8000-0000000000e3','e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1','e8000000-0000-4000-8000-0000000000a4','confirmed','unpaid'),
 ('e8000000-0000-4000-8000-0000000000e4','e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1','e8000000-0000-4000-8000-0000000000a5','confirmed','unpaid');

select set_config('request.jwt.claim.sub','e8000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;

-- ── B1: the graph is born whole ────────────────────────────────────────────
select case when (public.tournament_generate_bracket(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-0000000000e3',null]::uuid[]
)) = '{"ok": true, "byes": 1, "rounds": 2, "matches": 3, "draw_number": 1}'::jsonb
  then 'ok   B1 size-4 with a bye: 3 matches, 1 bye, draw #1'
  else 'B1 FAIL: generation result wrong' end;
reset role;
select case when not exists (
  select 1 from public.tournament_matches
   where division_id='e8000000-0000-4000-8000-0000000000d1' and group_id is null
     and round < 2 and next_match_id is null)
  then 'ok   B1 every non-final match is linked'
  else 'B1 FAIL: missing links' end;
select case when exists (
  select 1 from public.tournament_matches
   where division_id='e8000000-0000-4000-8000-0000000000d1' and round=2
     and 'e8000000-0000-4000-8000-0000000000e3' in (entry_a, entry_b))
  then 'ok   B1 the bye winner is already seated in the final'
  else 'B1 FAIL: bye winner did not advance' end;
select case when public.bracket_graph_intact()
  then 'ok   B1 merged sentinel passes over a bracket with byes'
  else 'B1 FAIL: sentinel red on legitimate byes' end;

-- ── B2..B4: exact-reject seat validation ───────────────────────────────────
select set_config('request.jwt.claim.sub','e8000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
do $$ begin
  perform public.tournament_generate_bracket(
    'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
    array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-0000000000e3']::uuid[]);
  raise exception 'B2 FAIL: non-power-of-two accepted';
exception when others then
  if sqlerrm like 'seats_not_power_of_two%' then raise notice 'ok   B2 non-power-of-two seat list raises';
  else raise; end if;
end $$;
do $$ begin
  perform public.tournament_generate_bracket(
    'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
    array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2',null]::uuid[]);
  raise exception 'B3 FAIL: duplicate seat accepted';
exception when others then
  if sqlerrm like 'seat_duplicate%' then raise notice 'ok   B3 duplicate seat raises with the id';
  else raise; end if;
end $$;
do $$ begin
  perform public.tournament_generate_bracket(
    'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
    array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-00000000ffff',null]::uuid[]);
  raise exception 'B4 FAIL: unregistered seat accepted';
exception when others then
  if sqlerrm like 'seat_not_registered%' then raise notice 'ok   B4 unregistered seat raises with the id';
  else raise; end if;
end $$;

-- ── B5: an unplayed regeneration is allowed and the draw history grows ─────
select case when (public.tournament_generate_bracket(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-0000000000e3',null]::uuid[]
)) ->> 'draw_number' = '2'
  then 'ok   B5 unplayed regeneration succeeds as draw #2'
  else 'B5 FAIL: redraw did not increment the history' end;

-- ── CB: an unplayed bracket clears; a played one refuses ───────────────────
select case when (public.tournament_clear_bracket(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1'
)) = '{"ok": true, "matches_removed": 3}'::jsonb
  then 'ok   CB unplayed bracket clears (3 removed, byes included as structure)'
  else 'CB FAIL: unplayed clear result wrong' end;
select case when (public.tournament_generate_bracket(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-0000000000e3',null]::uuid[]
)) ->> 'draw_number' = '3'
  then 'ok   CB regeneration after the clear is draw #3'
  else 'CB FAIL: post-clear draw number wrong' end;

-- ── B6: played matches refuse regeneration and survive it ──────────────────
select case when ((select public.tournament_score_match(m.id, 6, 2)
  from public.tournament_matches m
  where m.division_id='e8000000-0000-4000-8000-0000000000d1' and m.round=1 and m.status='pending' limit 1)) ->> 'ok' = 'true'
  then 'ok   B6 a real round-1 match is played'
  else 'B6 FAIL: could not score the setup match' end;
select case when (public.tournament_generate_bracket(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  array['e8000000-0000-4000-8000-0000000000e1','e8000000-0000-4000-8000-0000000000e2','e8000000-0000-4000-8000-0000000000e3',null]::uuid[]
)) ->> 'error' = 'bracket_played'
  then 'ok   B6 regeneration over a played bracket refuses'
  else 'B6 FAIL: played bracket was regenerated' end;
reset role;
select case when (select count(*) from public.tournament_matches
  where division_id='e8000000-0000-4000-8000-0000000000d1' and group_id is null and score_a is not null) = 1
  then 'ok   B6 the played match survived the refusal'
  else 'B6 FAIL: played history was erased' end;
select set_config('request.jwt.claim.sub','e8000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.tournament_clear_bracket(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1'
)) ->> 'error' = 'bracket_played'
  then 'ok   B6 clearing a played bracket refuses too'
  else 'B6 FAIL: played bracket was clearable' end;
reset role;

-- ── B7: duplicate draw numbers are structurally impossible ─────────────────
do $$ begin
  insert into public.tournament_draws (tournament_id,division_id,draw_number) values
   ('e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',1);
  raise exception 'B7 FAIL: duplicate draw_number accepted';
exception when unique_violation then
  raise notice 'ok   B7 duplicate draw_number raises unique_violation';
end $$;

-- ── P1..P4: pool lifecycle through the same discipline ─────────────────────
select set_config('request.jwt.claim.sub','e8000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role','authenticated', true);
set local role authenticated;
select case when (public.tournament_generate_pools(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  '[{"name":"Pool A","sort":0,"entries":[{"registration_id":"e8000000-0000-4000-8000-0000000000e1"},{"registration_id":"e8000000-0000-4000-8000-0000000000e2"}]},
    {"name":"Pool B","sort":1,"entries":[{"registration_id":"e8000000-0000-4000-8000-0000000000e3"},{"registration_id":"e8000000-0000-4000-8000-0000000000e4"}]}]'::jsonb
)) = '{"ok": true, "groups": 2, "entries": 4, "matches": 2, "draw_number": 4}'::jsonb
  then 'ok   P1 two pools of two: 2 matches, draw #4 continues the history'
  else 'P1 FAIL: pool generation result wrong' end;
select case when (public.tournament_clear_pools(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1'
)) = '{"ok": true, "groups_removed": 2, "matches_removed": 2}'::jsonb
  then 'ok   P2 unplayed pools clear cleanly'
  else 'P2 FAIL: clear result wrong' end;
do $$ begin
  perform public.tournament_generate_pools(
    'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
    '[{"name":"Pool A","sort":0,"entries":[{"registration_id":"e8000000-0000-4000-8000-00000000ffff"}]}]'::jsonb);
  raise exception 'P3 FAIL: unregistered pool entry accepted';
exception when others then
  if sqlerrm like 'pool_entry_not_registered%' then raise notice 'ok   P3 unregistered pool entry raises with the id';
  else raise; end if;
end $$;
select case when (public.tournament_generate_pools(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  '[{"name":"Pool A","sort":0,"entries":[{"registration_id":"e8000000-0000-4000-8000-0000000000e1"},{"registration_id":"e8000000-0000-4000-8000-0000000000e2"}]}]'::jsonb
)) ->> 'ok' = 'true'
  then 'ok   P4 pools regenerated for the played-refusal setup'
  else 'P4 FAIL: setup regeneration failed' end;
select case when ((select public.tournament_score_match(m.id, 5, 3)
  from public.tournament_matches m
  where m.division_id='e8000000-0000-4000-8000-0000000000d1' and m.group_id is not null limit 1)) ->> 'ok' = 'true'
  then 'ok   P4 a pool match is played'
  else 'P4 FAIL: could not score the pool match' end;
select case when (public.tournament_generate_pools(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1',
  '[{"name":"Pool A","sort":0,"entries":[{"registration_id":"e8000000-0000-4000-8000-0000000000e1"},{"registration_id":"e8000000-0000-4000-8000-0000000000e2"}]}]'::jsonb
)) ->> 'error' = 'pools_played'
       and (public.tournament_clear_pools(
  'e8000000-0000-4000-8000-0000000000dd','e8000000-0000-4000-8000-0000000000d1'
)) ->> 'error' = 'pools_played'
  then 'ok   P4 played pools refuse both regeneration and clearing'
  else 'P4 FAIL: played pools were erasable' end;
reset role;

rollback;
