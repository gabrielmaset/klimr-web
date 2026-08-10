-- 0215_search_discoverability.sql — KCDX-023 (P1): deterministic and AI search
-- apply incompatible privacy, status, and block rules.
--
-- ── WHAT EACH PATH ACTUALLY CHECKED ──────────────────────────────────────
-- The player branch of `global_search` filtered NOTHING beyond the text match:
-- no account status, no suspension, no block. Suspended members and people who
-- have blocked you were returned, and `app/search/actions.ts` then removed
-- blocked ids AFTERWARDS — after the branch limit and after the global cap, so
-- the removal also silently shrank the result set (the same shape as KCDX-025).
--
-- The AI path filtered a different set again: `open_to_invites` and sport, with
-- no account status and no block predicate at all.
--
-- So three surfaces disagreed about who is discoverable, and the disagreement
-- was not a design decision anyone made — each was written separately and each
-- author checked what was in front of them.
--
-- ── DISCOVERABILITY IS NOT READABILITY ───────────────────────────────────
-- The distinction the audit asks for, and the reason a policy could not have
-- solved this: being allowed to READ a profile you were linked to is a different
-- question from being allowed to FIND someone by typing part of their name. RLS
-- answers the first. Nothing answered the second, so each surface improvised.
--
-- `is_discoverable_player()` answers it once. Every search path calls it, so a
-- new surface inherits the rule rather than inventing a fourth version.

create or replace function public.is_discoverable_player(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_id
       and p.account_status = 'active'
       and p.id <> auth.uid()
       -- Symmetric: someone who blocked you must not surface in your search, and
       -- you must not surface in theirs. A one-way rule tells the blocked person
       -- they were blocked.
       and not public.is_blocked_pair(auth.uid(), p.id)
  );
$$;

grant execute on function public.is_discoverable_player(uuid) to authenticated, service_role;

comment on function public.is_discoverable_player is
  'KCDX-023: may the CALLER find this person by searching? Distinct from whether they may read the '
  'profile — RLS answers that. Active account, not self, not blocked in either direction. Every search '
  'path calls this so the three surfaces cannot drift apart again.';

-- Set form, so a caller filtering a candidate list does it in one round trip
-- rather than one call per person. Same predicate, evaluated as the CALLER —
-- "may THIS member find them" is not a property of the row alone.
create or replace function public.discoverable_players(p_ids uuid[])
returns table (player_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.id = any(p_ids)
     and p.account_status = 'active'
     and p.id <> auth.uid()
     and not public.is_blocked_pair(auth.uid(), p.id);
$$;

grant execute on function public.discoverable_players(uuid[]) to authenticated, service_role;

-- Tournaments have a lifecycle the search branch ignored entirely: a cancelled
-- or suspended event stayed findable and looked live.
create or replace function public.is_discoverable_tournament(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
     where t.id = p_id
       and t.cancelled_at is null
       and t.suspended_at is null
       and public.tournament_is_visible(t.id)
  );
$$;

grant execute on function public.is_discoverable_tournament(uuid) to authenticated, service_role;

-- ── the branches use them, BEFORE their limits ──────────────────────────
drop function if exists public.global_search(text, integer);

create or replace function public.global_search(
  p_q     text,
  p_limit integer default 30,
  p_kinds text[] default null
)
-- The second column is `id`, not `ref`. 0153 named it `id` and every caller reads
-- `r.id`; renaming it here would have compiled fine in SQL and broken the search
-- page at runtime. Keeping a signature stable is part of replacing a function.
returns table (kind text, id text, title text, subtitle text, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  with kinds_cte as (
    -- Validate against the known set rather than trusting the caller: an unknown
    -- kind must not silently return nothing, and a null means "all".
    select case
             when p_kinds is null or cardinality(p_kinds) = 0
               then array['player','court','team','event','tournament','listing','class','provider']
             else array(
               select k from unnest(p_kinds) k
                where k = any(array['player','court','team','event','tournament','listing','class','provider'])
             )
           end as kinds
  ),
  scale as (
    -- Fewer kinds asked for, more room for each. Capped at 4x so a single-kind
    -- search cannot make one branch scan far more than the page can show.
    select kinds,
           greatest(1, least(4, 8 / greatest(1, cardinality(kinds))))::int as per_kind
      from kinds_cte
  )
  select s.* from scale, lateral (
    with q as (
      select websearch_to_tsquery('english', p_q) as tsq,
             nullif(trim(p_q), '') as raw
    )
    select * from (
      select 'player'::text as kind, p.id::text, p.display_name as title,
             p.primary_sport as subtitle,
             greatest(ts_rank(p.search_tsv, q.tsq), similarity(p.display_name, q.raw))::real as rank
      from public.profiles p, q
      where char_length(q.raw) >= 2
        and 'player' = any(kinds)
        -- KCDX-023: this branch filtered nothing but the text match. Suspended
        -- members and people who had blocked the caller were returned, and the
        -- application removed blocked ids AFTERWARDS — after this limit and
        -- after the global cap, so the removal silently shrank the results too.
        and public.is_discoverable_player(p.id)
        and (p.search_tsv @@ q.tsq or p.display_name ilike q.raw || '%' or similarity(p.display_name, q.raw) > 0.3)
      order by rank desc limit (6 * per_kind)
    ) a
    union all
    select * from (
      select 'court', c.id::text, c.name, coalesce(c.neighborhood, c.city),
             greatest(ts_rank(c.search_tsv, q.tsq), similarity(c.name, q.raw))::real
      from public.courts c, q
      where char_length(q.raw) >= 2
        and 'court' = any(kinds) and c.is_active and c.is_private = false
        and (c.search_tsv @@ q.tsq or c.name ilike q.raw || '%' or similarity(c.name, q.raw) > 0.3)
      order by 5 desc limit (6 * per_kind)
    ) b
    union all
    select * from (
      select 'team', t.id::text, t.name, t.sport_key,
             greatest(ts_rank(t.search_tsv, q.tsq), similarity(t.name, q.raw))::real
      from public.teams t, q
      where char_length(q.raw) >= 2
        and 'team' = any(kinds)
        and (t.search_tsv @@ q.tsq or t.name ilike q.raw || '%' or similarity(t.name, q.raw) > 0.3)
      order by 5 desc limit (5 * per_kind)
    ) c
    union all
    select * from (
      -- KCDX-022: this filtered `events.starts_at` — the PARENT row of a series. A
      -- weekly game whose series row is dated in January vanishes from search in
      -- February, while its occurrences keep happening and the event page keeps
      -- rendering them. `next_occ` finds the next occurrence that is actually going
      -- ahead (not skipped, not cancelled, not closed) and both the filter and the
      -- displayed date come from that, so a live series stays findable and shows the
      -- date a player would turn up on.
      select 'event', e.id::text, e.title, to_char(next_occ.starts_at, 'Mon DD, YYYY'),
             greatest(ts_rank(e.search_tsv, q.tsq), similarity(e.title, q.raw))::real
      from public.events e, q
      cross join lateral (
        select o.starts_at
          from public.event_occurrences o
         where o.event_id = e.id
           and o.status not in ('skipped','cancelled')
           and o.closed_at is null
           and o.starts_at >= now() - interval '1 day'
         order by o.starts_at
         limit 1
      ) next_occ
      where char_length(q.raw) >= 2
        and 'event' = any(kinds)
        and e.status in ('active', 'published')
        and (e.search_tsv @@ q.tsq or e.title ilike q.raw || '%' or similarity(e.title, q.raw) > 0.3)
      order by 5 desc, next_occ.starts_at asc limit (5 * per_kind)
    ) d
    union all
    select * from (
      select 'tournament', t.code, t.title, t.sport_key,
             greatest(ts_rank(t.search_tsv, q.tsq), similarity(t.title, q.raw))::real
      from public.tournaments t, q
      where char_length(q.raw) >= 2
        and 'tournament' = any(kinds)
        -- A cancelled or suspended tournament stayed findable and looked live.
        and public.is_discoverable_tournament(t.id)
        and (t.search_tsv @@ q.tsq or t.title ilike q.raw || '%' or similarity(t.title, q.raw) > 0.3)
      order by 5 desc, (t.starts_at >= now() - interval '1 day') desc, t.starts_at asc limit (4 * per_kind)
    ) e
    union all
    select * from (
      select 'listing', l.id::text, l.title,
             coalesce(l.price_text, case when l.price_cents is not null then '$' || (l.price_cents / 100)::int else null end),
             greatest(ts_rank(l.search_tsv, q.tsq), similarity(l.title, q.raw))::real
      from public.marketplace_listings l, q
      where char_length(q.raw) >= 2
        and 'listing' = any(kinds) and l.status = 'active'
        and (l.search_tsv @@ q.tsq or l.title ilike q.raw || '%' or similarity(l.title, q.raw) > 0.3)
      order by 5 desc limit (4 * per_kind)
    ) f
    union all
    select * from (
      select 'class', cl.id::text, cl.title, cl.sport_key,
             greatest(ts_rank(cl.search_tsv, q.tsq), similarity(cl.title, q.raw))::real
      from public.classes cl, q
      where char_length(q.raw) >= 2
        and 'class' = any(kinds) and cl.status = 'published'
        and (cl.search_tsv @@ q.tsq or cl.title ilike q.raw || '%' or similarity(cl.title, q.raw) > 0.3)
      order by 5 desc limit (4 * per_kind)
    ) g
    union all
    select * from (
      select 'provider', cp.user_id::text, coalesce(cp.headline, 'Verified provider'),
             array_to_string(cp.roles, ', '),
             greatest(ts_rank(cp.search_tsv, q.tsq), similarity(coalesce(cp.headline, ''), q.raw))::real
      from public.class_providers cp, q
      where char_length(q.raw) >= 2
        and 'provider' = any(kinds) and cp.status = 'approved'
        -- An approved provider whose account is suspended, or who has blocked
        -- the caller, is not discoverable either — approval is about the
        -- credential, not about the account behind it.
        and public.is_discoverable_player(cp.user_id)
        and (cp.search_tsv @@ q.tsq or coalesce(cp.headline, '') ilike q.raw || '%' or similarity(coalesce(cp.headline, ''), q.raw) > 0.3)
      order by 5 desc limit (3 * per_kind)
    ) h
    order by rank desc
    limit greatest(1, least(p_limit, 40))
  ) s
$$;

revoke all on function public.global_search(text, integer, text[]) from public, anon;
grant execute on function public.global_search(text, integer, text[]) to authenticated, service_role;

comment on function public.global_search is
  'KCDX-022/025: events are matched on their next LIVE occurrence, not the series parent row, so a '
  'recurring game stays findable. Requested kinds are validated and unwanted branches are skipped '
  'BEFORE ranking, so a narrowed search is not competing for a cap with rows it will discard.';

-- ── KCDX-061: the zero-rate was arithmetically wrong ─────────────────────
-- `search_zero_rate` divided the zero count by the count of
-- `search_deterministic`. Those are disjoint: the application recorded ONE of
-- the two metrics per search, never both, so the denominator was HITS, not
-- searches.
--
-- The error grows with the quantity being measured, which is the worst property
-- a metric can have. Two zeros in ten searches reported 2/8 = 25% instead of
-- 20%. Five in ten reported 100%. A period where every search missed divided by
-- zero and reported nothing at all — so the dashboard looked calmest exactly
-- when search was most broken.
--
-- The application now records `search_deterministic` for EVERY search plus
-- `search_zero` on a miss, which is what its comment always claimed. This
-- function is rewritten to match, and to say plainly which column is the
-- denominator so the next reader does not have to work it out.
create or replace function public.search_zero_rate(p_hours int default 168)
returns table (searches bigint, zero_results bigint, zero_pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select metric from public.perf_samples
     where created_at > now() - make_interval(hours => greatest(p_hours, 1))
       and metric in ('search_deterministic', 'search_zero')
  )
  select
    -- denominator: one row per search, hit or miss
    count(*) filter (where metric = 'search_deterministic')::bigint as searches,
    count(*) filter (where metric = 'search_zero')::bigint          as zero_results,
    round(100.0 * count(*) filter (where metric = 'search_zero')
          / nullif(count(*) filter (where metric = 'search_deterministic'), 0), 1) as zero_pct
  from s;
$$;

comment on function public.search_zero_rate is
  'KCDX-061: share of searches returning nothing. `search_deterministic` is recorded for EVERY search '
  '(the denominator) and `search_zero` additionally on a miss. Before 0215 the two were disjoint, so '
  'this divided zeros by hits and over-reported — increasingly so as the real rate rose.';
