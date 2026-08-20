-- 0269_feed_own_pending_visible.sql — your own post never vanishes: pending
-- posts are ranked and counted for their AUTHOR, and for nobody else.
--
-- THE SYMPTOM (2026-08-12, owner screenshot). Publish a photo post; the feed
-- says "No posts from your courts yet" while a tab shows a non-zero count. The
-- posts RLS already lets an author read their own rows in ANY moderation state
-- (`author_id = auth.uid() OR (approved AND …)`), and the post card already
-- renders the "IN REVIEW · ONLY YOU" chip for status = pending — but
-- `get_ranked_feed` and `feed_type_counts` both filtered to approved-only, so
-- the author's fresh post was excluded from the very list built to show it,
-- while other code paths that count under RLS could still see it. Two
-- definitions of "visible", drifting — the exact defect class KRA-029 pinned
-- for counts-vs-list. The definition belongs in ONE place: these functions.
--
-- THE RULE. `visible(post, viewer)` for feed purposes is now:
--     approved, OR (viewer is the author AND status = 'pending').
-- Rejected stays hidden from the feed even for the author (the card's
-- NOT PUBLISHED treatment is reached from the author's profile, not the wire).
-- Strangers never see pending — the suite proves it as a real member.
-- Everything else below is byte-identical to 0266.

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
     where ( p.moderation_status = 'approved'
             or (p.author_id = (select uid from me) and p.moderation_status = 'pending') )
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
       -- KRA-029/OD-7, corrected twice. Exclude ONLY a post whose origin is KNOWN
       -- (its id is in posts_with_origin) and outside the radius (not in
       -- posts_within). Unknown origin is not a distance claim (0264), and the
       -- test must run through the DEFINER seam, not read post_origins as the
       -- caller (0266).
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

comment on function public.get_ranked_feed is
  'FEED-ARCHITECTURE §2/§4. INVOKER: RLS decides VISIBILITY, this decides ORDER. Feed visibility = '
  'approved OR the viewer''s own pending post (0269) — one definition, shared with feed_type_counts. '
  'Nearby excludes only posts with a KNOWN origin outside the radius; both origin tests run through '
  'DEFINER id-set helpers (posts_with_origin / posts_within) because post_origins is server-only.';

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
   where ( p.moderation_status = 'approved'
           or (p.author_id = (select uid from me) and p.moderation_status = 'pending') )
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

-- Explicit ACLs restated (0265 doctrine: no member RPC rides on platform
-- default privileges).
revoke all on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  to authenticated, service_role;
revoke all on function public.feed_type_counts(text, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.feed_type_counts(text, double precision, double precision, double precision)
  to authenticated, service_role;

select public.journal_migration('0269', '0269_feed_own_pending_visible.sql', null,
  'Feed visibility is approved plus the author viewing their own pending post, in both get_ranked_feed and feed_type_counts. Counts and list share one definition.');
