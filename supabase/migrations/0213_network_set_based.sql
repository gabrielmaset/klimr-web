-- 0213_network_set_based.sql — KCDX-030 (P1): network and played-together reads
-- truncate or scale with lifetime history.
--
-- Two separate scale problems on the same page.
--
-- ── (1) THE LIFETIME SCAN ────────────────────────────────────────────────
-- `app/network/page.tsx` builds the "played together N times" counts like this:
-- select EVERY `match_participants` row for the viewer (their whole history),
-- chunk the match ids 400 at a time, select every participant of every one of
-- those matches, and count in JavaScript.
--
-- The comment there says it is "chunked so the query stays bounded no matter how
-- active the player is". Chunking bounds each query; it does not bound the WORK.
-- A member with 2,000 matches issues five round trips and materialises tens of
-- thousands of rows into app memory on every page view, to compute a number
-- shown next to at most a few dozen people. That is O(lifetime) per render, and
-- it violates the standing rule that nothing on a hot path may scan per-user
-- history.
--
-- The set-based version asks the question that was actually being asked: for
-- THESE connections, how many matches do we share? One indexed join, one row per
-- person, work proportional to the answer rather than to the archive.
--
-- ── (2) UNORDERED CANDIDATE CAPS ─────────────────────────────────────────
-- `people_you_may_know` builds its candidate pools with `limit 400` and
-- `limit 200` and NO `order by`. Under a cap with no ordering, Postgres returns
-- whichever rows it reaches first — so once a member has more than 400
-- friends-of-friends, their suggestions stop being the best candidates and
-- become an arbitrary subset. The ranking that runs afterwards is then careful
-- scoring applied to a random sample.
--
-- That fix belongs with the pool rewrite and is NOT done here: `people_you_may_know`
-- is a large ranking query and changing its candidate selection changes what
-- every member sees. It needs the saturation metric the finding asks for — how
-- often the cap is actually hit — before anyone can say what ordering is right.
-- `pymk_pool_saturation()` below measures exactly that, so the decision can be
-- made from data instead of intuition.

-- ── 1. played-together, computed as a set ─────────────────────────────────
create or replace function public.played_together_counts(p_ids uuid[])
returns table (other_id uuid, matches integer)
language sql
stable
security definer
set search_path = public
as $$
  -- `match_participants` is not broadly readable under RLS, which is why the
  -- application reached for the admin client. SECURITY DEFINER does the same job
  -- without shipping the rows to Node: the function is scoped to the caller's own
  -- matches by construction, so it cannot reveal anyone else's history.
  select b.user_id, count(distinct a.match_id)::integer
    from public.match_participants a
    join public.match_participants b
      on b.match_id = a.match_id
     and b.user_id <> a.user_id
   where a.user_id = auth.uid()
     and b.user_id = any(p_ids)
   group by b.user_id;
$$;

revoke all on function public.played_together_counts(uuid[]) from public, anon;
grant execute on function public.played_together_counts(uuid[]) to authenticated, service_role;

comment on function public.played_together_counts is
  'KCDX-030: shared-match counts for a bounded set of people, in one indexed join. Replaces a '
  'lifetime scan of the viewer''s match history aggregated in application memory on every render.';

-- The join above wants both directions of the (match_id, user_id) pair indexed.
create index if not exists match_participants_user_match_idx
  on public.match_participants (user_id, match_id);
create index if not exists match_participants_match_user_idx
  on public.match_participants (match_id, user_id);

-- ── 2. measure the cap before changing it ─────────────────────────────────
-- How often does a candidate pool actually hit its limit? If the answer is
-- "never", the missing ORDER BY costs nothing and the pools can be left alone.
-- If it is common, the ordering decision has to be made deliberately, because it
-- changes what every member is shown.
create or replace function public.pymk_pool_saturation()
returns table (pool text, members_at_cap bigint, cap integer)
language sql
stable
security definer
set search_path = public
as $$
  select 'friends_of_friends', count(*), 400 from (
    select f.requester_id as uid, count(*) c
      from public.friendships f where f.status = 'accepted'
     group by f.requester_id having count(*) >= 20
  ) x
  union all
  select 'played_together', count(*), 400 from (
    select a.user_id as uid, count(*) c
      from public.match_participants a
     group by a.user_id having count(*) >= 400
  ) y;
$$;

revoke all on function public.pymk_pool_saturation() from public, anon, authenticated;
grant execute on function public.pymk_pool_saturation() to service_role;

comment on function public.pymk_pool_saturation is
  'KCDX-030: how many members are at or near a PYMK candidate cap. The pools use LIMIT with no ORDER BY, '
  'so anyone above a cap gets an arbitrary subset rather than their best candidates. Measure before '
  'rewriting the ranking query — the ordering choice changes what every member sees.';
