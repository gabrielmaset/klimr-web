-- social_graph_checks.sql — database-level tests for migration 0099.
-- Run in the Supabase SQL editor AFTER 0099. Everything happens inside one
-- transaction that ends in ROLLBACK: nothing persists, including the sandbox
-- users created for the test. Each numbered block raises an exception if the
-- behavior is wrong; success prints "ALL SOCIAL GRAPH CHECKS PASSED".

begin;

-- Sandbox members (profile rows appear via the on_auth_user_created trigger).
insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'graphtest-a@klimr.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'graphtest-b@klimr.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'graphtest-c@klimr.test');

-- Impersonation helper: makes auth.uid() return the given user for this txn.
create or replace function pg_temp.impersonate(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true);
$$;

do $body$
declare
  a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  c uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  r text;
  n int;
begin
  -- (1) request lifecycle + duplicate & self protection --------------------
  perform pg_temp.impersonate(a);
  r := public.request_connection(b);
  if r <> 'requested' then raise exception 'CHECK 1a failed: expected requested, got %', r; end if;
  r := public.request_connection(b);
  if r <> 'already_requested' then raise exception 'CHECK 1b failed: expected already_requested, got %', r; end if;
  r := public.request_connection(a);
  if r <> 'invalid' then raise exception 'CHECK 1c failed: self-request must be invalid, got %', r; end if;

  -- (2) reverse send auto-accepts inside one transaction -------------------
  perform pg_temp.impersonate(b);
  r := public.request_connection(a);
  if r <> 'accepted' then raise exception 'CHECK 2a failed: expected accepted, got %', r; end if;
  select connections_count into n from public.profiles where id = a;
  if n <> 1 then raise exception 'CHECK 2b failed: A connections_count=% (want 1)', n; end if;
  select connections_count into n from public.profiles where id = b;
  if n <> 1 then raise exception 'CHECK 2c failed: B connections_count=% (want 1)', n; end if;

  -- (3) canonical-pair uniqueness blocks a reverse duplicate row -----------
  begin
    insert into public.friendships (requester_id, addressee_id, status) values (b, a, 'pending');
    raise exception 'CHECK 3 failed: reverse duplicate insert was allowed';
  exception when unique_violation then null; -- exactly what we want
  end;

  -- (4) decline records a cooldown ------------------------------------------
  perform pg_temp.impersonate(c);
  r := public.request_connection(a);
  if r <> 'requested' then raise exception 'CHECK 4a failed: got %', r; end if;
  perform pg_temp.impersonate(a);
  perform public.remove_connection(c, true);  -- A declines C
  perform pg_temp.impersonate(c);
  r := public.request_connection(a);
  if r <> 'cooldown' then raise exception 'CHECK 4b failed: expected cooldown, got %', r; end if;
  -- ...but the decliner reaching out clears it
  perform pg_temp.impersonate(a);
  r := public.request_connection(c);
  if r <> 'requested' then raise exception 'CHECK 4c failed: decliner outreach should work, got %', r; end if;
  perform public.remove_connection(c, false); -- clean up (cancel, no cooldown)

  -- (5) mutual connections --------------------------------------------------
  perform pg_temp.impersonate(c);
  r := public.request_connection(b);
  perform pg_temp.impersonate(b);
  if not public.accept_connection(c) then raise exception 'CHECK 5a failed: accept returned false'; end if;
  -- A↔B and C↔B exist, so A and C share exactly one mutual: B.
  perform pg_temp.impersonate(a);
  select public.mutual_connections_count(c) into n;
  if n <> 1 then raise exception 'CHECK 5b failed: mutual count=% (want 1)', n; end if;

  -- (6) blocking severs and silences ----------------------------------------
  perform pg_temp.impersonate(a);
  perform public.block_player(b);
  select count(*) into n from public.friendships
   where least(requester_id, addressee_id) = least(a, b) and greatest(requester_id, addressee_id) = greatest(a, b);
  if n <> 0 then raise exception 'CHECK 6a failed: friendship survived a block'; end if;
  select connections_count into n from public.profiles where id = a;
  if n <> 0 then raise exception 'CHECK 6b failed: A counter=% after block (want 0)', n; end if;
  -- the blocked person can't reach back (and isn't told why)
  perform pg_temp.impersonate(b);
  r := public.request_connection(a);
  if r <> 'unavailable' then raise exception 'CHECK 6c failed: expected unavailable, got %', r; end if;
  if public.follow_player(a) then raise exception 'CHECK 6d failed: blocked follow returned true'; end if;
  -- even a raw insert is cancelled by the DB trigger
  insert into public.follows (follower_id, followee_id) values (b, a);
  select count(*) into n from public.follows where follower_id = b and followee_id = a;
  if n <> 0 then raise exception 'CHECK 6e failed: block-guard trigger let a follow through'; end if;

  -- (7) follow counters ------------------------------------------------------
  perform pg_temp.impersonate(c);
  if not public.follow_player(a) then raise exception 'CHECK 7a failed: follow returned false'; end if;
  select followers_count into n from public.profiles where id = a;
  if n <> 1 then raise exception 'CHECK 7b failed: followers_count=% (want 1)', n; end if;
  perform public.unfollow_player(a);
  select followers_count into n from public.profiles where id = a;
  if n <> 0 then raise exception 'CHECK 7c failed: followers_count=% after unfollow (want 0)', n; end if;

  raise notice 'ALL SOCIAL GRAPH CHECKS PASSED';
end;
$body$;

rollback;
