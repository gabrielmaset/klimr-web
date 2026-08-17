-- aal2_boundary_suite.sql — KFU-003 closure control.
-- Proves MFA is enforced by the DATABASE, not only by Next middleware: an AAL1
-- (or claim-less) caller cannot perform an ownership-destructive transition via
-- direct DML, while an AAL2 caller can, and ordinary membership writes are
-- untouched (no over-broad denial).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('ff000000-0000-0000-0000-0000000000a1','aal-owner@test.local'),
  ('ff000000-0000-0000-0000-0000000000a2','aal-member@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  ('ff000000-0000-0000-0000-0000000000a1','AAL Owner'),
  ('ff000000-0000-0000-0000-0000000000a2','AAL Member')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.sports (key, name, skill_system) values ('aal-sport','AAL Sport','Level')
on conflict (key) do nothing;
insert into public.teams (id, name, sport_key, created_by, max_size, join_policy) values
  ('ff000000-0000-0000-0000-0000000000b1','AAL Team','aal-sport','ff000000-0000-0000-0000-0000000000a1',8,'open')
on conflict (id) do nothing;
insert into public.team_members (team_id, user_id, role) values
  ('ff000000-0000-0000-0000-0000000000b1','ff000000-0000-0000-0000-0000000000a1','owner'),
  ('ff000000-0000-0000-0000-0000000000b1','ff000000-0000-0000-0000-0000000000a2','member')
on conflict do nothing;

-- ── predicate shape ─────────────────────────────────────────────────────────
select case when public.caller_aal() is null
  then 'ok   AAL caller_aal is null when no claim is present'
  else 'AAL-FAIL caller_aal invented a level' end;

-- NOTE ON METHOD. team_members has NO direct UPDATE policy: roster changes are
-- reachable only through DEFINER commands. Direct DML therefore matches zero
-- rows and proves nothing (the first draft of this suite made that mistake and
-- read as a gate failure). The trigger still fires INSIDE those commands, because
-- auth.uid() there is the caller — so the real commands are what we exercise.

-- ── AAL1 owner cannot transfer ownership ────────────────────────────────────
select set_config('request.jwt.claim.sub','ff000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"ff000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$
begin
  begin
    perform public.team_transfer_ownership('ff000000-0000-0000-0000-0000000000b1',
                                           'ff000000-0000-0000-0000-0000000000a2');
    raise exception 'AAL-FAIL an aal1 owner transferred ownership';
  exception when others then
    if sqlerrm <> 'aal2_required' then raise; end if;
  end;
end $$;
select 'ok   AAL an AAL1 caller cannot transfer team ownership';

-- ── claim-less caller is refused too (fail closed) ──────────────────────────
-- Same gated operation as above, with the assurance claim ABSENT rather than
-- 'aal1' — an unknown level must never be upgraded to satisfied.
select set_config('request.jwt.claims','{"sub":"ff000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.team_transfer_ownership('ff000000-0000-0000-0000-0000000000b1',
                                           'ff000000-0000-0000-0000-0000000000a2');
    raise exception 'AAL-FAIL a claim-less caller transferred ownership';
  exception when others then
    if sqlerrm <> 'aal2_required' then raise; end if;
  end;
end $$;
select 'ok   AAL an absent assurance claim is refused (fail closed)';

-- ── a NON-ownership roster change is unaffected (no over-broad denial) ──────
select set_config('request.jwt.claims','{"sub":"ff000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',true);
do $$
begin
  begin
    perform public.team_remove_member('ff000000-0000-0000-0000-0000000000b1',
                                      'ff000000-0000-0000-0000-0000000000a2');
  exception when others then
    if sqlerrm = 'aal2_required' then
      raise exception 'AAL-FAIL removing an ordinary member demanded AAL2 (over-broad)';
    end if;
    raise;
  end;
end $$;
select 'ok   AAL removing an ORDINARY member is unaffected by the gate';
reset role;

-- ── BASELINE: an AAL2 caller CAN perform the gated transition ───────────────
insert into public.team_members (team_id, user_id, role) values
  ('ff000000-0000-0000-0000-0000000000b1','ff000000-0000-0000-0000-0000000000a2','member')
on conflict do nothing;
select set_config('request.jwt.claims','{"sub":"ff000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','ff000000-0000-0000-0000-0000000000a1',true);
set local role authenticated;
select public.team_transfer_ownership('ff000000-0000-0000-0000-0000000000b1',
                                      'ff000000-0000-0000-0000-0000000000a2');
select case when (select role from public.team_members
                   where team_id='ff000000-0000-0000-0000-0000000000b1'
                     and user_id='ff000000-0000-0000-0000-0000000000a2') = 'owner'
  then 'ok   AAL BASELINE an AAL2 caller CAN transfer ownership (gate is not a wall)'
  else 'AAL-FAIL the AAL2 transfer did not take effect' end;
reset role;

-- ── service path passes through (moderation must keep working) ──────────────
select set_config('request.jwt.claims','',true);
select set_config('request.jwt.claim.sub','',true);
update public.team_members set role = 'manager'
 where team_id = 'ff000000-0000-0000-0000-0000000000b1'
   and user_id = 'ff000000-0000-0000-0000-0000000000a1';
select 'ok   AAL the service path is unaffected by the AAL gate';

rollback;
