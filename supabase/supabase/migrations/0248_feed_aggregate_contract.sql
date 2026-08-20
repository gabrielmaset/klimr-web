-- 0248_feed_aggregate_contract.sql — the ranking counts what a reader can
-- actually see, and the filter counts describe the feed rather than the window.
--
-- KRA-028 + part of KRA-029 (re-audit 2026-08-10).
--
-- KRA-028. 0229 replaced two correlated scalar subqueries with grouped CTEs —
-- correct and a large win — but `eng_comments` counts EVERY row in
-- `post_comments` regardless of `moderation_status`. The Feed itself only ever
-- displays approved comments (`app/feed/page.tsx` filters on them), so a post
-- with forty rejected or pending comments ranked as though it had forty. The
-- engagement signal was measuring moderation traffic, and the direction is the
-- wrong way round: content that attracts removed comments was promoted.
--
-- KRA-029 (counts). `typeCounts` was computed in the application AFTER the
-- ranked set had been capped at 60, so "Photos 3" meant "3 of the 60 posts we
-- happened to rank", not "3 photos in your feed". Selecting the filter then
-- showed items the count never described. Counting now happens over the SAME
-- candidate set the ranking draws from, before the cap, in one pass.

create or replace function public.get_ranked_feed(p_scope text default 'all', p_limit int default 60)
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
       -- KRA-028: only comments a reader can SEE count as engagement. Without
       -- this the ranking rewarded moderation traffic — a post that attracted
       -- forty removed comments outranked one that attracted five real ones.
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
  select d.id,
         d.score::real,
         d.likes,
         d.comments,
         exists (select 1 from public.post_likes pl
                  where pl.post_id = d.id and pl.user_id = (select uid from me)) as viewer_liked
    from diversified d
   where d.rn <= 3
   order by d.score desc
   limit greatest(coalesce(p_limit, 60), 1);
$$;

comment on function public.get_ranked_feed is
  'FEED-ARCHITECTURE §2/§4. SECURITY INVOKER: posts RLS decides VISIBILITY, this decides ORDER. '
  'KRA-028: engagement counts only APPROVED comments, matching what the Feed displays — otherwise '
  'moderation traffic is rewarded.';

-- ── counts that describe the feed, not the window ────────────────────────
-- Same candidate rule as the ranker, deliberately duplicated in ONE place rather
-- than recomputed per caller: if the two ever disagree the counts stop describing
-- the list they sit above, which is the defect being fixed.
create or replace function public.feed_type_counts(p_scope text default 'all')
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
   group by p.post_type;
$$;

revoke all on function public.feed_type_counts(text) from public, anon;
grant execute on function public.feed_type_counts(text) to authenticated, service_role;

comment on function public.feed_type_counts is
  'KRA-029: filter counts over the same candidate set the ranker draws from, BEFORE the top-N cap. '
  'Counting after the cap described the window rather than the feed, so selecting a filter showed '
  'items the count never accounted for. SECURITY INVOKER, so RLS applies as it does everywhere else.';

create or replace function public.feed_aggregate_contract_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- ranking counts only what a reader can see
    (select position('pc.moderation_status = ''approved''' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_ranked_feed' limit 1)
    -- both stay INVOKER: they decide ORDER and COUNT, never visibility
    and (select p.prosecdef = false
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'get_ranked_feed' limit 1)
    and (select p.prosecdef = false
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'feed_type_counts' limit 1);
$$;

revoke all on function public.feed_aggregate_contract_intact() from public, anon, authenticated;
grant execute on function public.feed_aggregate_contract_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 28)
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
