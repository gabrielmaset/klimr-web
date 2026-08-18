-- adult_admission_suite.sql — KFU-033 closure control.
-- Proves admission is a trusted, server-set fact: a null-age profile cannot make
-- member writes, a minor cannot obtain admission, a member cannot forge it, and
-- an adult who completes the validated path can. Suspension still overrides.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('ac000000-0000-0000-0000-0000000000a1','adm-adult@test.local'),
  ('ac000000-0000-0000-0000-0000000000a2','adm-nodob@test.local'),
  ('ac000000-0000-0000-0000-0000000000a3','adm-forger@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth) values
  ('ac000000-0000-0000-0000-0000000000a1','Adm Adult','1990-01-01')
on conflict (id) do update set display_name = excluded.display_name, date_of_birth = excluded.date_of_birth;
insert into public.profiles (id, display_name) values
  ('ac000000-0000-0000-0000-0000000000a2','Adm NoDob'),
  ('ac000000-0000-0000-0000-0000000000a3','Adm Forger')
on conflict (id) do update set display_name = excluded.display_name;

-- ── BASELINE: an attested adult CAN write (suite measures something) ─────────
select case when public.member_write_allowed('ac000000-0000-0000-0000-0000000000a1')
  then 'ok   ADM BASELINE an adult with a stored birth date is admitted'
  else 'ADM-FAIL adult not admitted' end;
select set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into public.posts (id, author_id, body)
values ('ac000000-0000-0000-0000-0000000000f1','ac000000-0000-0000-0000-0000000000a1','admitted post');
select 'ok   ADM an admitted adult can make a member write';
reset role;

-- ── the null-age profile is NOT admitted and cannot write ───────────────────
select case when public.member_write_allowed('ac000000-0000-0000-0000-0000000000a2') = false
  then 'ok   ADM a profile with NO birth date is not admitted'
  else 'ADM-FAIL null-age profile was admitted' end;

select set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-0000000000a2',true);
set local role authenticated;
do $$
begin
  begin
    insert into public.posts (author_id, body)
    values ('ac000000-0000-0000-0000-0000000000a2','should not land');
    raise exception 'ADM-FAIL a null-age profile made a member write';
  exception when others then
    if sqlerrm <> 'admission_required' then raise; end if;
  end;
end $$;
select 'ok   ADM a null-age profile cannot make member writes (admission_required)';
reset role;

-- ── a member cannot FORGE the admission fact ────────────────────────────────
select set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-0000000000a3',true);
set local role authenticated;
-- Two defenses stand here and EITHER is a pass: the 0191 column grant list does
-- not include adult_attested_at (so the write is refused outright), and the
-- trigger reverts a hand-set value if a grant ever widened. The assertion below
-- is on the END STATE, which is what actually matters.
do $$
begin
  begin
    update public.profiles set adult_attested_at = now()
     where id = 'ac000000-0000-0000-0000-0000000000a3';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select case when (select adult_attested_at from public.profiles
                   where id = 'ac000000-0000-0000-0000-0000000000a3') is null
  then 'ok   ADM a member cannot set adult_attested_at directly (forgery reverted)'
  else 'ADM-FAIL admission was forged from the data plane' end;

-- ── a minor cannot obtain admission ─────────────────────────────────────────
select set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-0000000000a3',true);
set local role authenticated;
do $$
begin
  begin
    perform public.attest_adult((current_date - interval '17 years')::date);
    raise exception 'ADM-FAIL a minor obtained admission';
  exception when others then
    if sqlerrm <> 'must_be_18' then raise; end if;
  end;
end $$;
select 'ok   ADM a minor cannot obtain admission through the command';
select public.attest_adult((current_date - interval '18 years')::date);
reset role;
-- adult_attested_at is deliberately absent from the member column grant list, so
-- these assertions read it outside the authenticated role.
select case when (select adult_attested_at from public.profiles
                   where id = 'ac000000-0000-0000-0000-0000000000a3') is not null
  then 'ok   ADM exactly 18 today is admitted (boundary is inclusive)'
  else 'ADM-FAIL an exactly-18 adult was refused' end;
select case when (select date_of_birth from public.profiles
                   where id = 'ac000000-0000-0000-0000-0000000000a3')
              = (current_date - interval '18 years')::date
  then 'ok   ADM the validated command stored the attested birth date'
  else 'ADM-FAIL the command did not store the date' end;

-- ── one day short of 18 is refused (the other side of the boundary) ─────────
select set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-0000000000a2',true);
set local role authenticated;
do $$
begin
  begin
    perform public.attest_adult((current_date - interval '18 years' + interval '1 day')::date);
    raise exception 'ADM-FAIL one day short of 18 was admitted';
  exception when others then
    if sqlerrm <> 'must_be_18' then raise; end if;
  end;
end $$;
select 'ok   ADM one day short of 18 is refused';
reset role;

-- ── the REAL onboarding path: a member writing their own adult birth date ───
-- This is how production admits people (app/onboarding/actions.ts updates the
-- member's own profile). It must earn admission without any privileged call.
insert into auth.users (id, email) values ('ac000000-0000-0000-0000-0000000000a4','adm-onboard@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name) values ('ac000000-0000-0000-0000-0000000000a4','Adm Onboard')
on conflict (id) do update set display_name = excluded.display_name;
select set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-0000000000a4',true);
set local role authenticated;
update public.profiles set date_of_birth = '1988-06-15'
 where id = 'ac000000-0000-0000-0000-0000000000a4';
reset role;
select case when public.member_write_allowed('ac000000-0000-0000-0000-0000000000a4')
  then 'ok   ADM the real onboarding path (member writes own adult DOB) earns admission'
  else 'ADM-FAIL onboarding did not admit the member' end;

-- ── suspension still overrides admission (KFU-028 unchanged) ────────────────
set local role service_role;
update public.profiles set account_status = 'suspended'
 where id = 'ac000000-0000-0000-0000-0000000000a1';
reset role;
select case when public.member_write_allowed('ac000000-0000-0000-0000-0000000000a1') = false
  then 'ok   ADM suspension still overrides admission'
  else 'ADM-FAIL a suspended but admitted member was allowed' end;

-- ── service path unaffected ─────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','',true);
insert into public.posts (author_id, body)
values ('ac000000-0000-0000-0000-0000000000a2','service-written row');
select 'ok   ADM the service path is unaffected by admission';

rollback;
