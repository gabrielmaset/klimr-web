-- 0250_post_origin_nearby.sql — gives posts a coarse origin so the "Nearby" lane
-- means what it says, without turning a private column into a queryable one.
--
-- KRA-029 / OD-7 (owner decision, 2026-08-10): "posts don't need to carry
-- location since we can get it from the user who posted it — our platform is
-- based on user location and posts are always made by users or for users."
-- Correct, and the ranked feed now scopes by distance. The implementation detail
-- below is the part that matters for safety.
--
-- ── WHY THE ORIGIN IS STAMPED AT WRITE TIME, NOT JOINED AT READ TIME ──────
-- The obvious implementation joins `posts → profiles.home_zip` when ranking. It
-- would work, and it would quietly convert a deliberately PRIVATE column into one
-- any member can query:
--
--   `home_zip` is not readable by `authenticated` (verified: has_column_privilege
--   returns false — 0191 kept it out of the public projection on purpose). But if
--   a post's presence in MY nearby feed depends on the author's CURRENT home_zip,
--   I can set my own ZIP, observe whether their posts appear, move my ZIP, and
--   repeat — binary-searching a value the schema refuses to show me. That is the
--   same oracle shape as KRA-020's availability grid, arriving through the back
--   door of a ranking function.
--
-- Stamping at write time removes the probe: the value is fixed when the post is
-- made, so moving my own ZIP re-sorts MY feed and tells me nothing about anyone
-- else. It also matches how `feed_items` has always worked (0115 takes `p_zip` at
-- emit) rather than inventing a second model of the same idea.
--
-- ── WHY THIS RESOLUTION IS NOT A NEW DISCLOSURE ──────────────────────────
-- The stored point is the ZIP CENTROID, resolved by the application from the
-- author's home ZIP. `profiles_public` already publishes `city` and `state` to
-- every member, so "this author is within N miles of me" reveals nothing the
-- profile does not already state. It is emphatically NOT device GPS, not a court
-- check-in, and not a location at a point in time — the three things that would
-- be a genuine escalation.
--
-- ── AND THE COLUMNS ARE NEVER READABLE ───────────────────────────────────
-- The point is used in a WHERE clause and never returned. Column privileges are
-- revoked from both member roles below, so even a hand-written PostgREST select
-- cannot read a coordinate back out. The ranker stays SECURITY INVOKER: it
-- decides ORDER and DISTANCE, never who may see a row.

-- ── the coordinate lives OFF the member-readable table ───────────────────
-- My first draft added `origin_lat`/`origin_lng` to `posts` and revoked SELECT on
-- those two columns. The sentinel failed on the next replay:
-- `has_column_privilege('authenticated', …, 'origin_lat')` was still TRUE, because
-- `authenticated` holds a TABLE-level SELECT on `posts` and a column revoke cannot
-- subtract from a wider grant. 0191 recorded exactly this and I did it anyway.
--
-- Revoking table-level SELECT on `posts` and re-granting every other column would
-- be a large blast radius on the busiest table in the schema. The coordinate goes
-- in a side table instead, which no member role can read at all.
create table if not exists public.post_origins (
  post_id uuid primary key references public.posts(id) on delete cascade,
  lat     double precision not null,
  lng     double precision not null
);

alter table public.post_origins enable row level security;
revoke all on public.post_origins from anon, authenticated;
grant all on public.post_origins to service_role;

create index if not exists post_origins_box_idx on public.post_origins (lat, lng);

comment on table public.post_origins is
  'KRA-029/OD-7: ZIP-centroid origin of a post, stamped at write time from the AUTHOR''S home ZIP. '
  'Coarse by construction — never device GPS, never a check-in. Server-only: members reach it solely '
  'through posts_within(), which returns post ids and never a coordinate.';

-- Great-circle miles. IMMUTABLE and parameterised so the planner can inline it.
create or replace function public.miles_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql
immutable
parallel safe
as $$
  select 3958.7613 * 2 * asin(least(1, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

revoke all on function public.miles_between(double precision, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.miles_between(double precision, double precision, double precision, double precision)
  to authenticated, service_role;

-- ── the id-set helper ────────────────────────────────────────────────────
-- Returns POST IDS within a radius and nothing else. No coordinate is ever
-- returned, so a caller learns "this post is somewhere near that point" and never
-- where the author is.
--
-- The residual is stated rather than hidden: a member CAN sweep points and infer
-- which authors post from which areas. That is bounded by design and by what is
-- already public — `profiles_public` publishes `city` and `state` to every member,
-- so a ≥25-mile disc is coarser than the profile itself. The radius floor is what
-- keeps that true: without it, a caller could shrink the disc and turn a
-- city-level fact into a neighbourhood-level one.
create or replace function public.posts_within(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_mi double precision default 60
) returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    -- Floor of 25 miles: fine enough for a metro feed, coarse enough that
    -- sweeping it reveals no more than the public city already does.
    select least(greatest(coalesce(p_radius_mi, 60), 25), 250) as mi
  )
  select o.post_id
    from public.post_origins o, r
   where p_lat is not null and p_lng is not null
     and o.lat between p_lat - (r.mi / 69.0) and p_lat + (r.mi / 69.0)
     and o.lng between p_lng - (r.mi / 45.0) and p_lng + (r.mi / 45.0)
     and public.miles_between(p_lat, p_lng, o.lat, o.lng) <= r.mi;
$$;

revoke all on function public.posts_within(double precision, double precision, double precision)
  from public, anon;
grant execute on function public.posts_within(double precision, double precision, double precision)
  to authenticated, service_role;

-- ── the ranker learns 'nearby' ───────────────────────────────────────────
-- The viewer's own point is passed IN by the caller rather than joined from their
-- profile: it is their own row, the application already resolves it for the
-- regional lane, and taking it as an argument keeps this function from needing to
-- read any profile location at all.
--
-- A viewer with no point falls back to the global set rather than an empty feed —
-- the zipless-viewer rule the regional lane has always used.
drop function if exists public.get_ranked_feed(text, int);

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
       -- KRA-029/OD-7: distance applies only when the caller asked for it AND
       -- supplied a point. Your own posts and your circle's are never distance-
       -- filtered out — moving house should not empty your own feed.
       --
       -- The predicate is an id set from a DEFINER helper, because this function
       -- is INVOKER and members cannot read `post_origins`. Ids are not secret;
       -- RLS still decides which of them a member may actually load.
       and (
         p_scope <> 'nearby'
         or p_lat is null or p_lng is null
         or p.author_id = (select uid from me)
         or p.author_id in (select g.pid from graph g)
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

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.post_origin_private_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- a coordinate must never be readable by a member, in either role
    not has_table_privilege('authenticated', 'public.post_origins', 'SELECT')
    and not has_table_privilege('anon', 'public.post_origins', 'SELECT')
    -- and the coordinate must not have leaked onto the posts table, where a
    -- table-level grant would expose it (the mistake this migration started with)
    and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'posts'
         and column_name in ('origin_lat', 'origin_lng')
    )
    -- and the ranker must stay INVOKER, or distance scoping would bypass RLS
    and (select p.prosecdef = false
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'get_ranked_feed' limit 1);
$$;

revoke all on function public.post_origin_private_intact() from public, anon, authenticated;
grant execute on function public.post_origin_private_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 30)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
