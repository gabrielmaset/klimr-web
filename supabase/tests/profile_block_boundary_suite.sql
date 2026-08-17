-- profile_block_boundary_suite.sql — KFU-004 closure control.
-- Proves the block holds at the BASE TABLE (the path a direct PostgREST caller
-- takes), in both directions, with a non-zero baseline and a no-over-broad-
-- denial check.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('ab000000-0000-0000-0000-0000000000a1','blk-a@test.local'),
  ('ab000000-0000-0000-0000-0000000000a2','blk-b@test.local'),
  ('ab000000-0000-0000-0000-0000000000a3','blk-c@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  ('ab000000-0000-0000-0000-0000000000a1','Blk A'),
  ('ab000000-0000-0000-0000-0000000000a2','Blk B'),
  ('ab000000-0000-0000-0000-0000000000a3','Blk C')
on conflict (id) do update set display_name = excluded.display_name;

-- ── BASELINE first: before any block, A can read B (suite measures something) ─
select set_config('request.jwt.claim.sub','ab000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select case when exists (select 1 from public.profiles where id='ab000000-0000-0000-0000-0000000000a2')
  then 'ok   BLK BASELINE before any block, A can read B from the base table'
  else 'BLK-FAIL baseline read failed' end;
reset role;

-- ── A blocks B ───────────────────────────────────────────────────────────────
insert into public.blocks (blocker_id, blocked_id)
values ('ab000000-0000-0000-0000-0000000000a1','ab000000-0000-0000-0000-0000000000a2')
on conflict do nothing;

-- direction 1: the BLOCKER cannot read the blocked member's base row
select set_config('request.jwt.claim.sub','ab000000-0000-0000-0000-0000000000a1',true);
set local role authenticated;
select case when not exists (select 1 from public.profiles where id='ab000000-0000-0000-0000-0000000000a2')
  then 'ok   BLK the blocker cannot read the blocked member from the BASE table'
  else 'BLK-FAIL blocker still reads the blocked row' end;
select case when (select display_name from public.profiles where id='ab000000-0000-0000-0000-0000000000a2') is null
  then 'ok   BLK selecting a single granted column returns nothing (no column-level bypass)'
  else 'BLK-FAIL a granted column leaked the blocked row' end;
reset role;

-- direction 2: the BLOCKED member cannot read the blocker either
select set_config('request.jwt.claim.sub','ab000000-0000-0000-0000-0000000000a2',true);
set local role authenticated;
select case when not exists (select 1 from public.profiles where id='ab000000-0000-0000-0000-0000000000a1')
  then 'ok   BLK the blocked member cannot read the blocker (both directions)'
  else 'BLK-FAIL block is one-directional at the base table' end;
-- count parity: the blocked row must not be countable either
select case when (select count(*) from public.profiles
                   where id in ('ab000000-0000-0000-0000-0000000000a1','ab000000-0000-0000-0000-0000000000a3')) = 1
  then 'ok   BLK COUNT parity: a blocked row is not countable, an unrelated one is'
  else 'BLK-FAIL count revealed a blocked row' end;
reset role;

-- ── self and unrelated members are unaffected (no over-broad denial) ─────────
select set_config('request.jwt.claim.sub','ab000000-0000-0000-0000-0000000000a2',true);
set local role authenticated;
select case when exists (select 1 from public.profiles where id='ab000000-0000-0000-0000-0000000000a2')
  then 'ok   BLK a member can always read their OWN row'
  else 'BLK-FAIL self-lockout' end;
select case when exists (select 1 from public.profiles where id='ab000000-0000-0000-0000-0000000000a3')
  then 'ok   BLK an unrelated member is still readable (no over-broad denial)'
  else 'BLK-FAIL unrelated member was hidden' end;
reset role;

-- ── the view and the table now agree ────────────────────────────────────────
select set_config('request.jwt.claim.sub','ab000000-0000-0000-0000-0000000000a1',true);
set local role authenticated;
select case when (select count(*) from public.profiles_public where id='ab000000-0000-0000-0000-0000000000a2')
            = (select count(*) from public.profiles where id='ab000000-0000-0000-0000-0000000000a2')
  then 'ok   BLK the view and the base table agree on a blocked pair'
  else 'BLK-FAIL view and table disagree' end;
reset role;

-- ── service path still resolves both (moderation must work) ─────────────────
select set_config('request.jwt.claim.sub','',true);
select case when (select count(*) from public.profiles
                   where id in ('ab000000-0000-0000-0000-0000000000a1','ab000000-0000-0000-0000-0000000000a2')) = 2
  then 'ok   BLK the service path still resolves both sides of a block'
  else 'BLK-FAIL service path lost access' end;

rollback;
