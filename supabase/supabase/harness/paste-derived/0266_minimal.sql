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
       and pc.moderation_status = 'approved'
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

revoke all on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  to authenticated, service_role;
revoke all on function public.feed_type_counts(text, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.feed_type_counts(text, double precision, double precision, double precision)
  to authenticated, service_role;

select public.journal_migration('0266', '0266_nearby_origin_containment.sql', null,
  'Unknown-origin test moved into DEFINER posts_with_origin(); 0264 read post_origins as the caller and broke every member feed call.');
