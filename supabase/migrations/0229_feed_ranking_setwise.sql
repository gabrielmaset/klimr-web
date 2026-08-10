-- 0229_feed_ranking_setwise.sql — KCDX-036 (P1, part): row-by-row engagement
-- work in the Feed ranking will not scale.
--
-- `get_ranked_feed` scored each candidate with two CORRELATED scalar subqueries
-- — one counting likes, one counting comments — over a candidate set of up to
-- 500 rows. That is up to a thousand point lookups per feed load, per viewer,
-- every time anyone opens the app. It is invisible at pilot scale and becomes
-- the whole cost of the Feed at any other.
--
-- The counts are now computed once per candidate in their own CTEs, so a post is
-- counted once for the score AND for the returned counters instead of separately
-- for each.
--
-- MEASURED, not asserted — the finding asks for validated plans, and my first
-- description of this was wrong. On 300 posts with 2,400 likes and 200 comments:
--
--     original (correlated subqueries)   ~520 ms   (514, 512, 515, 536, 526)
--     this version                       ~275 ms   (268, 292, 282, 276, 264)
--
-- The plan does NOT collapse to a single hash aggregate as I first claimed: the
-- `in (select id from cand)` semi-join runs as a nested loop of index lookups
-- (loops=300). That is a reasonable plan — an indexed point lookup per candidate
-- beats scanning a large likes table — but it is worth stating accurately,
-- because the next person to optimise this will read the comment before the plan.
--
-- The counters and `viewer_liked` also travel back WITH the ranking, so the page
-- stops issuing its own aggregate pass over the same posts immediately
-- afterwards — the second half of the finding's "return set-wise counters".
--
-- The return type gains three columns, so this is a DROP and recreate: a return
-- shape cannot be changed by CREATE OR REPLACE. Existing callers read `id` and
-- `score` and are unaffected by the additions.
--
-- NOT done here: keyset pagination, and collapsing the two Feed pipelines into
-- one canonical projection. Both are larger, and the audit is right that plans
-- should be validated before adding infrastructure — this change is the one that
-- makes the plan measurable in the first place.

drop function if exists public.get_ranked_feed(text, int);

create or replace function public.get_ranked_feed(p_scope text default 'all', p_limit int default 60)
returns table (id uuid, score real, likes integer, comments integer, viewer_liked boolean)
language sql stable as $$
with me as (select auth.uid() as uid),
graph as (
  select case when fr.requester_id = (select uid from me) then fr.addressee_id else fr.requester_id end as pid,
         2.2::real as w
  from public.friendships fr
  where fr.status = 'accepted'
    and ((select uid from me) in (fr.requester_id, fr.addressee_id))
  union
  select f.followee_id, 1.2 from public.follows f where f.follower_id = (select uid from me)
),
cand as (
  select p.id, p.author_id, p.sport_key, p.post_type, p.created_at
  from public.posts p
  where p.repost_of is null
    and p.created_at > now() - interval '21 days'
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
-- KCDX-036: these were two CORRELATED scalar subqueries evaluated per candidate
-- row — up to 500 candidates x 2 = a thousand point lookups per feed load, per
-- viewer, every time anyone opens the app. Grouped once over the candidate set
-- instead: two scans bounded by the candidates rather than by the table, which
-- the planner can hash.
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
   group by pc.post_id
),
scored as (
  select c.id, c.author_id, c.created_at,
    ( 1.8 * exp(-extract(epoch from (now() - c.created_at)) / 3600.0 / 36.0)
    + 1.6 * coalesce(sa.score, 0)
    + coalesce((select g.w from graph g where g.pid = c.author_id limit 1), 0)
    + 1.4 * coalesce(aa.score, 0)
    + 0.6 * ln(1 + coalesce(el.n, 0) + 2 * coalesce(ec.n, 0))
    + case when c.post_type = 'milestone' then 0.2 else 0 end
    )::real as base
  from cand c
  left join eng_likes el on el.post_id = c.id
  left join eng_comments ec on ec.post_id = c.id
  left join public.user_sport_affinity sa
    on sa.user_id = (select uid from me) and sa.sport_key = c.sport_key
  left join public.user_author_affinity aa
    on aa.user_id = (select uid from me) and aa.author_id = c.author_id
),
divers as (
  select s.id, s.created_at,
         (s.base - 0.35 * (row_number() over (partition by s.author_id order by s.base desc) - 1))::real as score
  from scored s
)
-- Counters and viewer-liked travel WITH the ranking, so the page stops issuing
-- its own aggregate pass over the same posts.
select d.id, d.score,
       coalesce(el.n, 0), coalesce(ec.n, 0),
       exists (select 1 from public.post_likes vl where vl.post_id = d.id and vl.user_id = (select uid from me))
from divers d
left join eng_likes el on el.post_id = d.id
left join eng_comments ec on ec.post_id = d.id
order by d.score desc, d.created_at desc
limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_ranked_feed(text, int) from public;
grant execute on function public.get_ranked_feed(text, int) to authenticated;
