-- rls_negative_suite.sql — negative authorization tests against REAL roles
-- (KCDX-018).
--
-- WHY THIS FILE EXISTS. `rls_and_invariants_checks.sql` establishes identity by
-- setting `request.jwt.claims` and then runs its probes as whoever invoked it —
-- in the SQL editor, that is the owner. RLS does not apply to a table's owner and
-- grants do not constrain a superuser, so a probe that "proves" one member cannot
-- read another's row proves nothing at all. It is worse than no test: it reports
-- PASSED while asking the wrong question. That is precisely what the audit means
-- by false assurance, and this suite is the answer to it.
--
-- The difference is one line per check: `SET LOCAL ROLE authenticated`. Once the
-- current role is actually `anon` or `authenticated`, table grants are checked,
-- RLS policies are evaluated, and a refusal is a real refusal.
--
-- WHAT IT STILL IS NOT. This is Postgres-level. It proves grants, policies and
-- triggers. It does not exercise PostgREST, Storage or Realtime, which have their
-- own authorization layers — those need a disposable Supabase project and belong
-- to the Tier-2 suite. This file closes the gap between "we asserted it" and "we
-- asserted it as the role that matters"; it does not close the gap between
-- Postgres and the edge.
--
-- SAFE ON PRODUCTION: one transaction, ends in ROLLBACK. Nothing persists,
-- including the synthetic identities. Run it in the Supabase SQL editor after a
-- migration batch, or in CI against the replay database.

begin;

-- ── assertion helpers ─────────────────────────────────────────────────────
create function pg_temp.as_role(p_role text, p_sub uuid) returns void
language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  if p_sub is not null then
    perform set_config('request.jwt.claim.sub', p_sub::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_sub::text, 'role', p_role)::text, true);
  end if;
end $$;

/** The statement must be REFUSED, and refused for the right reason. A check that
 *  accepts any error would pass on a typo in the test itself. */
create function pg_temp.expect_denied(p_label text, p_sql text, p_role text, p_sub uuid default null)
returns void language plpgsql as $$
declare got text := 'SUCCESS';
begin
  perform pg_temp.as_role(p_role, p_sub);
  begin
    execute p_sql;
  exception
    when insufficient_privilege then got := 'denied';
    when others then got := 'other:' || sqlstate;
  end;
  execute 'reset role';
  if got <> 'denied' then
    raise exception 'FAIL [%] as %: expected permission denied, got %', p_label, p_role, got;
  end if;
  raise notice '  ok  %  (% refused)', p_label, p_role;
end $$;

/** The statement must be refused with a specific SQLSTATE — used where the
 *  boundary is a trigger raising a domain error rather than a privilege check. */
create function pg_temp.expect_error(p_label text, p_sql text, p_sqlstate text, p_role text, p_sub uuid default null)
returns void language plpgsql as $$
declare got text := 'SUCCESS';
begin
  perform pg_temp.as_role(p_role, p_sub);
  begin
    execute p_sql;
  exception when others then got := sqlstate;
  end;
  execute 'reset role';
  if got <> p_sqlstate then
    raise exception 'FAIL [%] as %: expected SQLSTATE %, got %', p_label, p_role, p_sqlstate, got;
  end if;
  raise notice '  ok  %  (% refused, %)', p_label, p_role, p_sqlstate;
end $$;

/** The statement must SUCCEED — the other half of the contract. A boundary that
 *  refuses everything is not secure, it is broken, and only this direction
 *  catches that. */
create function pg_temp.expect_ok(p_label text, p_sql text, p_role text, p_sub uuid default null)
returns void language plpgsql as $$
declare err text;
begin
  perform pg_temp.as_role(p_role, p_sub);
  begin
    execute p_sql;
    err := null;
  exception when others then err := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  if err is not null then
    raise exception 'FAIL [%] as %: expected success, got %', p_label, p_role, err;
  end if;
  raise notice '  ok  %  (% permitted)', p_label, p_role;
end $$;

-- ── synthetic identities ──────────────────────────────────────────────────
-- Seeded as the owner, before any role switch. Rolled back at the end.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'suite-a@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'suite-b@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, date_of_birth, phone, home_zip, neighborhood, city, state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Suite A', '1990-01-01', '5550000001', '90066', 'Mar Vista', 'Los Angeles', 'CA'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Suite B', '1985-06-15', '5550000002', '90210', 'Beverly Hills', 'Beverly Hills', 'CA')
on conflict (id) do update
  set date_of_birth = excluded.date_of_birth,
      phone         = excluded.phone,
      home_zip      = excluded.home_zip,
      neighborhood  = excluded.neighborhood;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
begin
  raise notice '';
  raise notice 'KCDX-001 — profile PII';
  perform pg_temp.expect_denied('B''s DOB/phone/home ZIP',
    format('select date_of_birth, phone, home_zip from public.profiles where id = %L', B), 'authenticated', A);
  perform pg_temp.expect_denied('wildcard select on profiles',
    'select * from public.profiles limit 1', 'authenticated', A);
  perform pg_temp.expect_denied('B''s neighbourhood',
    format('select neighborhood from public.profiles where id = %L', B), 'authenticated', A);
  perform pg_temp.expect_denied('B''s account state',
    format('select account_status from public.profiles where id = %L', B), 'authenticated', A);
  perform pg_temp.expect_ok('B''s approved public projection',
    format('select display_name, city, state, is_active from public.profiles_public where id = %L', B), 'authenticated', A);
  perform pg_temp.expect_ok('own private row',
    'select date_of_birth, phone, home_zip from public.profile_private', 'authenticated', A);

  raise notice '';
  raise notice 'KCDX-002 / 008 — queue presence and the operator credential';
  perform pg_temp.expect_denied('anon reads queue teams',
    'select * from public.queue_teams limit 1', 'anon');
  perform pg_temp.expect_denied('member reads queue team members',
    'select * from public.queue_team_members limit 1', 'authenticated', A);
  perform pg_temp.expect_denied('member reads join requests',
    'select * from public.queue_join_requests limit 1', 'authenticated', A);
  perform pg_temp.expect_denied('member reads the operator credential',
    'select display_code, code from public.court_sessions limit 1', 'authenticated', A);
  perform pg_temp.expect_denied('member reads the geofence centre',
    'select center_lat, center_lng from public.court_sessions limit 1', 'authenticated', A);
  perform pg_temp.expect_ok('member reads public session fields',
    'select id, title, status from public.court_sessions limit 1', 'authenticated', A);

  raise notice '';
  raise notice 'KCDX-003 — tournament self-service writes';
  perform pg_temp.expect_denied('member writes a registration directly',
    format('insert into public.tournament_registrations (tournament_id, registrant_id, status, payment_status) '
           'values (gen_random_uuid(), %L, ''confirmed'', ''confirmed'')', A), 'authenticated', A);
  perform pg_temp.expect_denied('member marks their entry paid',
    'update public.tournament_registrations set payment_status = ''confirmed''', 'authenticated', A);
  perform pg_temp.expect_denied('member forges a payment row',
    format('insert into public.tournament_payments (registration_id, tournament_id, submitted_by, status) '
           'values (gen_random_uuid(), gen_random_uuid(), %L, ''confirmed'')', A), 'authenticated', A);
  perform pg_temp.expect_denied('member injects a roster player',
    format('insert into public.tournament_registration_players (registration_id, tournament_id, user_id) '
           'values (gen_random_uuid(), gen_random_uuid(), %L)', B), 'authenticated', A);

  raise notice '';
  raise notice 'KCDX-006 — video containment';
  perform pg_temp.expect_error('member posts a video', format(
    'insert into public.posts (author_id, body, post_type, audience) values (%L, ''x'', ''video'', ''public'')', A),
    '23514', 'authenticated', A);
  perform pg_temp.expect_error('service_role posts a video (no privileged bypass)', format(
    'insert into public.posts (author_id, body, post_type, audience) values (%L, ''x'', ''video'', ''public'')', A),
    '23514', 'service_role');

  raise notice '';
  raise notice 'KCDX-016 — privileges RLS cannot constrain';
  perform pg_temp.expect_denied('member TRUNCATEs profiles',
    'truncate public.profiles', 'authenticated', A);
  perform pg_temp.expect_denied('anon reads invite codes',
    'select * from public.invite_codes limit 1', 'anon');
  perform pg_temp.expect_denied('anon reads error logs',
    'select * from public.error_logs limit 1', 'anon');
  perform pg_temp.expect_denied('anon reads courts',
    'select * from public.courts limit 1', 'anon');
  perform pg_temp.expect_ok('anon still reads reference data',
    'select count(*) from public.sports', 'anon');
  perform pg_temp.expect_ok('anon still reads zip regions',
    'select count(*) from public.zip_regions', 'anon');

  raise notice '';
  raise notice 'ALL NEGATIVE AUTHORIZATION CHECKS PASSED';
end $$;

-- ── KCDX-005: re-moderation is a trigger, so it is asserted by behaviour ──
do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  pid uuid := gen_random_uuid();
  st  text;
begin
  insert into public.posts (id, author_id, body, moderation_status, audience, post_type)
  values (pid, A, 'seed body', 'approved', 'public', 'post');

  -- The approval MUST be made as service_role. `posts_force_pending` forces every
  -- insert to 'pending', and `guard_moderation_update` reverts a status change
  -- from any role that is not literally service_role — including the owner. An
  -- earlier version of this block approved as the owner, silently left the post
  -- at 'pending', and then "passed" its own assertion because the expected end
  -- state was also 'pending'. It was green for the wrong reason: the exact defect
  -- this file exists to replace. A negative control (dropping the trigger and
  -- expecting a failure) is what caught it, which is why the controls are part
  -- of the procedure and not an optional extra.
  perform pg_temp.as_role('service_role', null);
  update public.posts set moderation_status = 'approved' where id = pid;
  execute 'reset role';

  select moderation_status into st from public.posts where id = pid;
  if st <> 'approved' then
    raise exception 'FAIL [KCDX-005 setup]: the fixture post is % , not approved — the test would be vacuous', st;
  end if;
  if not exists (select 1 from public.feed_items where object_kind = 'post' and object_id = pid) then
    raise exception 'FAIL [KCDX-005 setup]: the fixture post never reached the Feed, so withdrawal cannot be observed';
  end if;

  perform pg_temp.as_role('authenticated', A);
  update public.posts set body = 'edited after approval' where id = pid;
  execute 'reset role';

  select moderation_status into st from public.posts where id = pid;
  if st <> 'pending' then
    raise exception 'FAIL [KCDX-005]: an edit to an approved post left it as %', st;
  end if;
  if exists (select 1 from public.feed_items where object_kind = 'post' and object_id = pid) then
    raise exception 'FAIL [KCDX-005]: the edited post is still in the Feed projection';
  end if;
  raise notice '  ok  edit to an approved post returns it to review AND withdraws it from the Feed';
end $$;

rollback;
