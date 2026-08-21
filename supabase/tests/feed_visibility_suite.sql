-- feed_visibility_suite.sql — the ranked feed and its counts, executed AS A REAL
-- MEMBER. Exists because this surface emptied twice: 0250 treated an unknown
-- origin as "far away" (fixed in 0264), and 0264's fix read the server-only
-- post_origins table inside an INVOKER function, so every member call failed
-- with a permission error (fixed in 0266). Both regressions were invisible to
-- suites that ran as postgres; this one runs as `authenticated`, which is the
-- role the incident happened to.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-0000000000f0','fvs-viewer@test.local'),
  ('f1000000-0000-0000-0000-0000000000f1','fvs-noorigin@test.local'),
  ('f1000000-0000-0000-0000-0000000000f2','fvs-near@test.local'),
  ('f1000000-0000-0000-0000-0000000000f3','fvs-far@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth, phone, home_zip, neighborhood, city, state) values
  ('f1000000-0000-0000-0000-0000000000f0','FVS Viewer','1990-01-01','+13105550290','90066','Mar Vista','Los Angeles','CA'),
  ('f1000000-0000-0000-0000-0000000000f1','FVS NoOrigin','1990-01-01','+13105550291','90066','Mar Vista','Los Angeles','CA'),
  ('f1000000-0000-0000-0000-0000000000f2','FVS Near','1990-01-01','+13105550292','90066','Mar Vista','Los Angeles','CA'),
  ('f1000000-0000-0000-0000-0000000000f3','FVS Far','1990-01-01','+13105550293','10001','Chelsea','New York','NY')
-- The auth.users trigger auto-creates profiles, so DO UPDATE must carry every
-- column the suite depends on — including date_of_birth, which since 0283 is
-- what admits a member to make writes.
on conflict (id) do update set display_name = excluded.display_name,
  date_of_birth = excluded.date_of_birth;
insert into public.posts (id, author_id, body, moderation_status, audience) values
  ('f2000000-0000-0000-0000-0000000000e0','f1000000-0000-0000-0000-0000000000f0','fvs own','approved','public'),
  ('f2000000-0000-0000-0000-0000000000e1','f1000000-0000-0000-0000-0000000000f1','fvs no origin','approved','public'),
  ('f2000000-0000-0000-0000-0000000000e2','f1000000-0000-0000-0000-0000000000f2','fvs near','approved','public'),
  ('f2000000-0000-0000-0000-0000000000e3','f1000000-0000-0000-0000-0000000000f3','fvs far','approved','public');
insert into public.post_origins (post_id, lat, lng) values
  ('f2000000-0000-0000-0000-0000000000e2', 34.0210, -118.4500),
  ('f2000000-0000-0000-0000-0000000000e3', 40.7128, -74.0060);

-- posts_force_pending pins every insert to 'pending' regardless of the value
-- supplied; approving goes through the same seam the moderation pipeline uses.
-- The first version of this suite skipped this, every candidate was pending, and
-- the first visibility assertion failed on a wrong fixture — which is why the
-- approved-status check below is a named precondition.
select set_config('klimr.privileged_write', 'on', true);
update public.posts set moderation_status = 'approved'
 where id in ('f2000000-0000-0000-0000-0000000000e0','f2000000-0000-0000-0000-0000000000e1',
              'f2000000-0000-0000-0000-0000000000e2','f2000000-0000-0000-0000-0000000000e3');
select set_config('klimr.privileged_write', '', true);

-- fixture preconditions: fail here means the fixture is wrong, not the feature
do $$
begin
  if exists (select 1 from public.post_origins where post_id = 'f2000000-0000-0000-0000-0000000000e1') then
    raise exception 'FIXTURE: no-origin post unexpectedly has an origin row';
  end if;
  if (select count(*) from public.post_origins
       where post_id in ('f2000000-0000-0000-0000-0000000000e2','f2000000-0000-0000-0000-0000000000e3')) <> 2 then
    raise exception 'FIXTURE: near/far posts missing origin rows';
  end if;
  if (select count(*) from public.posts
       where id in ('f2000000-0000-0000-0000-0000000000e0','f2000000-0000-0000-0000-0000000000e1',
                    'f2000000-0000-0000-0000-0000000000e2','f2000000-0000-0000-0000-0000000000e3')
         and moderation_status = 'approved') <> 4 then
    raise exception 'FIXTURE: posts not approved — posts_force_pending pinned them';
  end if;
  if exists (select 1 from public.friendships
              where requester_id = 'f1000000-0000-0000-0000-0000000000f0'
                 or addressee_id = 'f1000000-0000-0000-0000-0000000000f0')
     or exists (select 1 from public.follows where follower_id = 'f1000000-0000-0000-0000-0000000000f0') then
    raise exception 'FIXTURE: viewer has graph edges; strangers must be strangers';
  end if;
  raise notice 'ok   fixture preconditions';
end $$;

select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-0000000000f0', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare ids uuid[]; total int;
begin
  -- The call itself is the first assertion: 0264's regression made this raise
  -- "permission denied for table post_origins" for every member, every scope.
  select coalesce(array_agg(f.id), '{}') into ids
    from public.get_ranked_feed('nearby', 60, 34.0522, -118.4437, 60) f;
  raise notice 'ok   member can execute get_ranked_feed';

  if not ids @> array['f2000000-0000-0000-0000-0000000000e0'::uuid] then
    raise exception 'FEED: viewer''s own post missing from nearby lane';
  end if;
  raise notice 'ok   own post visible';
  if not ids @> array['f2000000-0000-0000-0000-0000000000e1'::uuid] then
    raise exception 'FEED: unknown-origin post hidden — 0250 regression is back';
  end if;
  raise notice 'ok   unknown-origin post visible';
  if not ids @> array['f2000000-0000-0000-0000-0000000000e2'::uuid] then
    raise exception 'FEED: in-radius post hidden';
  end if;
  raise notice 'ok   near post visible';
  -- the non-vacuous baseline: the distance filter must exclude something
  if ids @> array['f2000000-0000-0000-0000-0000000000e3'::uuid] then
    raise exception 'FEED: far-origin post visible — distance filter not running';
  end if;
  raise notice 'ok   far post excluded (filter proven live)';

  select coalesce(sum(n), 0) into total
    from public.feed_type_counts('nearby', 34.0522, -118.4437, 60);
  raise notice 'ok   member can execute feed_type_counts';
  if total < 3 then
    raise exception 'COUNTS: nearby total % below the 3 fixture posts the lane shows', total;
  end if;
  raise notice 'ok   counts cover the fixture set';
end $$;

reset role;

-- Rolling compatibility for a not-yet-redeployed app: 0264 dropped the
-- single-argument feed_type_counts and CLAIMED a stale caller would fail
-- loudly. This suite falsified that claim on its first run: the four-argument
-- form's parameter defaults absorb the one-argument call shape, so a stale
-- caller silently gets 'all'-scope counts instead of an error. Same for the
-- two-argument get_ranked_feed shape. That accident is what keeps an old
-- deployed build rendering during a rolling deploy, so it is pinned here as a
-- guarantee; removing these defaults is a deliberate contraction step that may
-- happen only after the owner confirms the current app build is live.
do $$
declare t int;
begin
  select coalesce(sum(n), 0) into t from public.feed_type_counts('all');
  raise notice 'ok   one-argument call resolves to the four-argument form (rolling compat)';
  perform * from public.get_ranked_feed('all', 5);
  raise notice 'ok   two-argument ranker call resolves via defaults (rolling compat)';
end $$;


-- ── 0269: the author's own pending post is ranked and counted; nobody else's ─
reset role;
insert into public.posts (id, author_id, body, audience) values
  ('f2000000-0000-0000-0000-0000000000e9','f1000000-0000-0000-0000-0000000000f0','fvs own pending','public');
select case when (select moderation_status from public.posts where id='f2000000-0000-0000-0000-0000000000e9') = 'pending'
  then 'ok   FIXTURE own post pinned pending by trigger'
  else 'FIXTURE own-pending post is not pending - trigger changed' end;

select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-0000000000f0', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select case when exists (select 1 from public.get_ranked_feed('all', 60, null, null, 60) r
                          where r.id = 'f2000000-0000-0000-0000-0000000000e9')
  then 'ok   PENDING own pending post is ranked for its author'
  else 'FEED-PENDING author does not see own pending post in ranker' end;

select case when (select coalesce(sum(n),0) from public.feed_type_counts('all', null, null, 60))
           = (select count(*) from public.get_ranked_feed('all', 200, null, null, 60))
  then 'ok   COUNTS counts and ranker agree for the author (incl. pending)'
  else 'COUNTS author disagreement: counts=' ||
       (select coalesce(sum(n),0) from public.feed_type_counts('all', null, null, 60))::text || ' ranker=' ||
       (select count(*) from public.get_ranked_feed('all', 200, null, null, 60))::text end;

reset role;
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-0000000000f3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select case when not exists (select 1 from public.get_ranked_feed('all', 60, null, null, 60) r
                              where r.id = 'f2000000-0000-0000-0000-0000000000e9')
  then 'ok   PENDING pending post is invisible to a stranger'
  else 'FEED-PENDING stranger can see someone else pending post' end;

select case when (select coalesce(sum(n),0) from public.feed_type_counts('all', null, null, 60))
           = (select count(*) from public.get_ranked_feed('all', 200, null, null, 60))
  then 'ok   COUNTS counts and ranker agree for a stranger (pending excluded from both)'
  else 'COUNTS stranger disagreement: counts=' ||
       (select coalesce(sum(n),0) from public.feed_type_counts('all', null, null, 60))::text || ' ranker=' ||
       (select count(*) from public.get_ranked_feed('all', 200, null, null, 60))::text end;

rollback;
