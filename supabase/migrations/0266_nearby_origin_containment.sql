-- 0266_nearby_origin_containment.sql — members can call the feed again: the
-- unknown-origin test now goes through a DEFINER helper instead of reading the
-- server-only table directly.
--
-- WHAT 0264 BROKE. Its predicate was right about the semantics (no origin row
-- must mean visible, not far away) but implemented it as a direct NOT EXISTS
-- read of public.post_origins inside get_ranked_feed and feed_type_counts,
-- both SECURITY INVOKER. 0250 deliberately revoked ALL on post_origins from
-- anon and authenticated: origins are exact coordinates, server-only, reached
-- only through the DEFINER id-set helper posts_within(). An INVOKER function
-- reads tables as its caller, and PostgreSQL checks privileges for EVERY
-- relation in a statement at executor startup, not lazily per OR branch. So
-- after 0264 every member call to either function failed with permission
-- denied for table post_origins, for every scope. Caught on the replay
-- harness by running the acceptance as a real authenticated role.
--
-- THE FIX. Same semantics, same containment as 0250: a second DEFINER helper
-- returns only the IDS of recent posts that HAVE an origin row, never a
-- coordinate. Excluded then means: origin known (id in posts_with_origin)
-- AND outside the radius (id not in posts_within). A post in neither set is
-- unknown and stays visible. Time-bounded to the same 30-day window the
-- candidate set uses, so the anti-join stays small and indexed.
--
-- PASTE NOTE. The first delivery of this migration died in the SQL editor
-- with a mangled quote character inside a long comment string (2026-08-12,
-- iPad copy path). This version opens with a one-line canary and keeps every
-- string literal short and dollar-quoted where long, so a quote-corrupting
-- transport fails on line 31 with an obvious tiny statement instead of
-- somewhere deep in a function.

select 'paste-check: quotes intact' as ok;

create or replace function public.posts_with_origin(
  p_since timestamptz
) returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.post_id
    from public.post_origins o
    join public.posts p on p.id = o.post_id
   where p.created_at > p_since;
$$;

revoke all on function public.posts_with_origin(timestamptz) from public, anon;
grant execute on function public.posts_with_origin(timestamptz) to authenticated, service_role;

comment on function public.posts_with_origin is $klimr$
DEFINER id-set helper, same containment contract as posts_within(): returns
post IDS that have a recorded origin, never a coordinate. Exists so INVOKER
feed functions can test origin-known without SELECT on the server-only
post_origins table (0250 revoked it from members; 0264 read it directly and
broke every member feed call).
$klimr$;

create or replace function public.get_ranked_feed(
  p_scope     text default 'all',
  p_limit     int default 60,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_mi double precision default 60
)
returns table (id uuid, score real, likes integer, comments integer, viewer_liked boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  graph as (
    select f.addressee_id as pid from public.friendships f
      where f.requester_id = (select uid from me) and f.status = 'accepted'
    union
    select f.requester_id from public.friendships f
      where f.addressee_id = (select uid from me) and f.status = 'accepted'
    union
    select fo.followee_id from public.follows fo
      where fo.follower_id = (select uid from me)
  ),
  cand as (
    select p.id, p.author_id, p.created_at, p.post_type
      from public.posts p
     where p.moderation_status = 'approved'
       and p.created_at > now() - interval '30 days'
       and (
         p.sport_key is null
         or p.sport_key in (select ps.sport_key from public.player_sports ps
                            where ps.user_id = (select uid from me) and ps.active)
         or p.author_id in (select g.pid from graph g)
         or p.author_id = (select uid from me)
       )
       and (p_scope <> 'circle'
            or p.author_id in (select g.pid from graph g)
            or p.author_id = (select uid from me))
       -- KRA-029/OD-7, corrected twice. Exclude ONLY a post whose origin is
       -- KNOWN (id in posts_with_origin) and outside the radius (not in
       -- posts_within). Unknown origin is not a distance claim (0264), and
       -- the test must run through the DEFINER seam, not read post_origins
       -- as the caller (this migration).
       and (
         p_scope <> 'nearby'
         or p_lat is null or p_lng is null
         or p.author_id = (select uid from me)
         or p.author_id in (select g.pid from graph g)
         or p.id not in (select pid from public.posts_with_origin(now() - interval '30 days') as t(pid))
         or p.id in (select pid from public.posts_within(p_lat, p_lng, p_radius_mi) as t(pid))
       )
     order by p.created_at desc
     limit 500
  ),
  eng_likes as (
    select pl.post_id, count(*)::int as n
      from public.post_likes pl
     where pl.post_id in (select id from cand)
     group by pl.post_id
  ),
  eng_comments as (
    select pc.post_id, count(*)::int as n
      from public.post_comments pc
     where pc.post_id in (select id from cand)
       and pc.moderation_status = 'approved'   -- KRA-028
     group by pc.post_id
  ),
  scored as (
    select c.id, c.author_id, c.created_at,
           coalesce(el.n, 0) as likes,
           coalesce(ec.n, 0) as comments,
           (
             coalesce(el.n, 0) * 1.0
             + coalesce(ec.n, 0) * 2.0
             + case when c.author_id in (select g.pid from graph g) then 6.0 else 0.0 end
           ) * exp((-0.693 * extract(epoch from (now() - c.created_at)) / 3600.0) / 36.0) as score
      from cand c
      left join eng_likes el on el.post_id = c.id
      left join eng_comments ec on ec.post_id = c.id
  ),
  diversified as (
    select s.*, row_number() over (partition by s.author_id order by s.score desc) as rn
      from scored s
  )
  select d.id, d.score::real, d.likes, d.comments,
         exists (select 1 from public.post_likes pl
                  where pl.post_id = d.id and pl.user_id = (select uid from me)) as viewer_liked
    from diversified d
   where d.rn <= 3
   order by d.score desc
   limit greatest(coalesce(p_limit, 60), 1);
$$;

comment on function public.get_ranked_feed is $klimr$
FEED-ARCHITECTURE sections 2 and 4. INVOKER: RLS decides VISIBILITY, this
decides ORDER. Nearby excludes only posts with a KNOWN origin outside the
radius; both origin tests run through DEFINER id-set helpers
(posts_with_origin / posts_within) because post_origins is server-only.
Reading it directly as the caller broke every member feed call on 2026-08-12.
$klimr$;

create or replace function public.feed_type_counts(
  p_scope     text default 'all',
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_mi double precision default 60
)
returns table (post_type text, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  graph as (
    select f.addressee_id as pid from public.friendships f
      where f.requester_id = (select uid from me) and f.status = 'accepted'
    union
    select f.requester_id from public.friendships f
      where f.addressee_id = (select uid from me) and f.status = 'accepted'
    union
    select fo.followee_id from public.follows fo
      where fo.follower_id = (select uid from me)
  )
  select p.post_type, count(*)::int
    from public.posts p
   where p.moderation_status = 'approved'
     and p.created_at > now() - interval '30 days'
     and (
       p.sport_key is null
       or p.sport_key in (select ps.sport_key from public.player_sports ps
                          where ps.user_id = (select uid from me) and ps.active)
       or p.author_id in (select g.pid from graph g)
       or p.author_id = (select uid from me)
     )
     and (p_scope <> 'circle'
          or p.author_id in (select g.pid from graph g)
          or p.author_id = (select uid from me))
     and (
       p_scope <> 'nearby'
       or p_lat is null or p_lng is null
       or p.author_id = (select uid from me)
       or p.author_id in (select g.pid from graph g)
       or p.id not in (select pid from public.posts_with_origin(now() - interval '30 days') as t(pid))
       or p.id in (select pid from public.posts_within(p_lat, p_lng, p_radius_mi) as t(pid))
     )
   group by p.post_type;
$$;

-- Explicit ACLs on everything this migration touched (0265 doctrine: no
-- member RPC rides on platform default privileges).
revoke all on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  to authenticated, service_role;
revoke all on function public.feed_type_counts(text, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.feed_type_counts(text, double precision, double precision, double precision)
  to authenticated, service_role;

select public.journal_migration('0266', '0266_nearby_origin_containment.sql', null,
  'Unknown-origin test moved through the posts_with_origin helper. 0264 read post_origins as the caller and broke every member feed call.');
