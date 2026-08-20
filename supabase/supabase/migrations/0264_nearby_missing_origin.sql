-- 0264_nearby_missing_origin.sql — a post with no recorded origin is shown, not
-- hidden.
--
-- REGRESSION FIX, 2026-08-11. Reported as "when I post something on the feed, it
-- doesn't show up in the actual feed."
--
-- 0250 gave the ranked feed a real `nearby` scope (OD-7), and the Feed page began
-- passing `p_scope = 'nearby'` for the DEFAULT lane. The distance predicate
-- required a row in `post_origins`:
--
--     or p.id in (select pid from public.posts_within(...))
--
-- Origins are stamped at write time by `stampPostOrigin()`, and **no backfill was
-- ever run** — that was recorded as owed and then not treated as blocking. So
-- every post that existed before the deploy has no origin row, the predicate is
-- false for all of them, and the default lane collapsed to "my own posts plus my
-- connections'". For a member with few connections that is an empty feed.
--
-- The defect is the semantics, not the missing backfill: **"we do not know where
-- this came from" is not the same as "this is far away."** Treating an unknown as
-- a failed distance test hides content on the basis of data we never had. The
-- backfill would have masked it; the predicate would still have been wrong for
-- every post whose author has no home ZIP.
--
-- A post is now excluded only when it HAS an origin and that origin is outside the
-- radius. Unknown-origin posts stay visible, so the lane degrades gracefully:
-- it filters what it can and never empties. That also makes the backfill a
-- quality improvement rather than a prerequisite, which is the right shape for
-- any derived-data feature.

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
       -- KRA-029/OD-7, corrected. Exclude ONLY a post that has a known origin
       -- outside the radius. No origin row means no distance claim either way,
       -- and an unknown must not be treated as a failed test.
       and (
         p_scope <> 'nearby'
         or p_lat is null or p_lng is null
         or p.author_id = (select uid from me)
         or p.author_id in (select g.pid from graph g)
         or not exists (select 1 from public.post_origins o where o.post_id = p.id)
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

comment on function public.get_ranked_feed is
  'FEED-ARCHITECTURE §2/§4. INVOKER: RLS decides VISIBILITY, this decides ORDER. Nearby excludes only '
  'posts with a KNOWN origin outside the radius — an unrecorded origin is not evidence of distance, '
  'and treating it as such emptied the default lane on 2026-08-11.';

-- The type counts must draw on the same candidate rule, or the number above the
-- filter describes a different set than the list below it — which is the defect
-- KRA-029 was raised about, and which the app reintroduced by passing 'all' to
-- the counts while passing 'nearby' to the ranker.
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
       or not exists (select 1 from public.post_origins o where o.post_id = p.id)
       or p.id in (select pid from public.posts_within(p_lat, p_lng, p_radius_mi) as t(pid))
     )
   group by p.post_type;
$$;

revoke all on function public.feed_type_counts(text, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.feed_type_counts(text, double precision, double precision, double precision)
  to authenticated, service_role;

-- The single-argument form the app currently calls is dropped, so a stale caller
-- fails loudly instead of silently counting a different set (0214, 0243).
drop function if exists public.feed_type_counts(text);

select public.journal_migration('0264', '0264_nearby_missing_origin.sql', null,
  'Regression fix: unknown post origin no longer excluded from the nearby lane.');
