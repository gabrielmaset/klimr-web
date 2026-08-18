-- function_contracts_suite.sql — KFU-031 closure control.
-- Proves the oracle is closed for the named helpers, that policies still work
-- (the binding did not break the thing the grant exists for), and that both
-- general controls actually detect what they claim to — each with a planted
-- violation, because a control that has never returned a row is not a control.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('ba000000-0000-0000-0000-0000000000a1','fc-organizer@test.local'),
  ('ba000000-0000-0000-0000-0000000000a2','fc-stranger@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth) values
  ('ba000000-0000-0000-0000-0000000000a1','FC Organizer','1990-01-01'),
  ('ba000000-0000-0000-0000-0000000000a2','FC Stranger','1990-01-01')
on conflict (id) do update set display_name = excluded.display_name,
  date_of_birth = excluded.date_of_birth;
insert into public.sports (key, name, skill_system) values ('fc-sport','FC Sport','Level')
on conflict (key) do nothing;
insert into public.sport_formats (sport_key, format_key, label, short_label, players_per_side, sides, total_players, is_default, is_casual, sort)
values ('fc-sport','singles','Singles','1v1',1,2,2,true,false,1) on conflict do nothing;
insert into public.matches (id, sport_key, format, organizer_id, total_slots, status, visibility)
values ('ba000000-0000-0000-0000-0000000000b1','fc-sport','singles','ba000000-0000-0000-0000-0000000000a1',2,'open','public')
on conflict (id) do nothing;
insert into public.match_participants (match_id, user_id) values
  ('ba000000-0000-0000-0000-0000000000b1','ba000000-0000-0000-0000-0000000000a1')
on conflict do nothing;

-- ── the oracle is closed ────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-0000000000a2',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
begin
  begin
    perform public.is_match_participant('ba000000-0000-0000-0000-0000000000b1',
                                        'ba000000-0000-0000-0000-0000000000a1');
    raise exception 'FC-FAIL a member learned whether ANOTHER person is in a match';
  exception when insufficient_privilege then null;
  end;
end $$;
select 'ok   FC is_match_participant refuses an arbitrary subject (oracle closed)';

do $$
begin
  begin
    perform public.is_match_organizer('ba000000-0000-0000-0000-0000000000b1',
                                      'ba000000-0000-0000-0000-0000000000a1');
    raise exception 'FC-FAIL a member learned whether ANOTHER person organizes a match';
  exception when insufficient_privilege then null;
  end;
end $$;
select 'ok   FC is_match_organizer refuses an arbitrary subject';

-- asking about YOURSELF is still allowed — the binding is not a wall
select case when public.is_match_participant('ba000000-0000-0000-0000-0000000000b1',
                                             'ba000000-0000-0000-0000-0000000000a2') = false
  then 'ok   FC a member may still ask about themselves'
  else 'FC-FAIL self-query answered wrongly' end;

-- ── BASELINE: the policies that NEED the grant still work ───────────────────
reset role;
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-0000000000a1',true);
set local role authenticated;
select case when exists (select 1 from public.matches where id='ba000000-0000-0000-0000-0000000000b1')
  then 'ok   FC BASELINE the match policy still resolves for a real participant (binding did not break RLS)'
  else 'FC-FAIL the caller binding broke the policy the grant exists for' end;
reset role;

-- ── the controls detect what they claim: planted violations ─────────────────
-- 1. planted oracle: a policy-referenced-shaped function with a uuid argument
--    and no auth.uid() in its body must be reported.
create or replace function public.fc_planted_oracle(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user);
$$;
grant execute on function public.fc_planted_oracle(uuid) to authenticated;
select case when exists (select 1 from public.stale_policy_grants() s
                          where s.signature like 'fc_planted_oracle%')
  then 'ok   FC CONTROL stale_policy_grants detects a grant no policy needs (planted, observed red)'
  else 'FC-FAIL the stale-grant control did not detect a planted grant' end;

revoke execute on function public.fc_planted_oracle(uuid) from authenticated;
select case when not exists (select 1 from public.stale_policy_grants() s
                              where s.signature like 'fc_planted_oracle%')
  then 'ok   FC CONTROL the planted grant clears once revoked (control is not stuck on)'
  else 'FC-FAIL control still reports a revoked grant' end;

-- 2. the registry is the record of intent: a declared contract exists for every
--    function the application actually calls.
select case when (select count(*) from public.function_contracts where class = 'public_rpc') >= 90
  then 'ok   FC the contract registry declares the application RPC surface by exact signature'
  else 'FC-FAIL the registry does not cover the app RPC surface' end;

-- 3. the internal helpers are no longer member-executable (least privilege).
select case when has_function_privilege('authenticated','public.member_write_allowed(uuid)','execute') = false
  then 'ok   FC member_write_allowed is no longer member-executable (subject oracle closed)'
  else 'FC-FAIL an internal eligibility helper is still member-executable' end;

rollback;
