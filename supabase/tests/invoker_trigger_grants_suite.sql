-- invoker_trigger_grants_suite.sql — KFU-005 closure control.
-- Every SECURITY INVOKER trigger that calls a helper must have that helper
-- executable by the roles that fire the trigger. This suite exercises the
-- provider-application freeze path under the REAL authenticated role (a member
-- submitting), which is the caller that 0239's sweep could have broken. It also
-- plants a negative control: revoke the grant and prove the member write fails,
-- so we know the test measures the real dependency.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values ('cc000000-0000-0000-0000-0000000000d1','itg-member@test.local') on conflict do nothing;
insert into public.profiles (id, display_name) values ('cc000000-0000-0000-0000-0000000000d1','ITG Member')
  on conflict (id) do update set display_name = excluded.display_name;

-- positive: a member submits an application; the invoker freeze trigger must be
-- able to compute the hash.
select set_config('request.jwt.claim.sub','cc000000-0000-0000-0000-0000000000d1',true);
set local role authenticated;
insert into public.provider_applications (user_id, role, status)
  values ('cc000000-0000-0000-0000-0000000000d1','coach','pending');
select case when (select content_hash is not null from public.provider_applications
                   where user_id = 'cc000000-0000-0000-0000-0000000000d1') then
  'ok   ITG member submission fires the freeze trigger and stores a hash'
  else 'ITG-FAIL hash not computed under authenticated' end;
reset role;

-- negative control: revoke the grant, prove the same member write now fails at
-- the trigger's helper call (permission denied), confirming the suite measures
-- the real privilege dependency.
revoke execute on function public.provider_application_hash(public.provider_applications) from authenticated;
insert into auth.users (id, email) values ('cc000000-0000-0000-0000-0000000000d2','itg-member2@test.local') on conflict do nothing;
insert into public.profiles (id, display_name) values ('cc000000-0000-0000-0000-0000000000d2','ITG Member2')
  on conflict (id) do update set display_name = excluded.display_name;
select set_config('request.jwt.claim.sub','cc000000-0000-0000-0000-0000000000d2',true);
set local role authenticated;
do $$
begin
  begin
    insert into public.provider_applications (user_id, role, status)
      values ('cc000000-0000-0000-0000-0000000000d2','coach','pending');
    raise exception 'ITG-FAIL negative control did not fire: member write succeeded without the grant';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'ok   ITG negative control: revoking the helper grant breaks the member write (test is real)';

rollback;
