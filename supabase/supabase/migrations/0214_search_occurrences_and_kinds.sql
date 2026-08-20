-- 0214_search_occurrences_and_kinds.sql — KCDX-022 and KCDX-025 (P1).
--
-- ── KCDX-022: recurring events disappear from search ─────────────────────
-- The event branch filtered `events.starts_at` — the PARENT row of a series. A
-- weekly Tuesday game has one `events` row, dated when the series was created,
-- and many `event_occurrences`. Once that parent date is a day old the series
-- vanishes from search entirely, while the occurrences keep happening and the
-- event page keeps rendering them. The data to do this correctly has existed
-- since 0129 and the event page already computes it; search simply never used it.
--
-- The branch now finds the next occurrence that is actually going ahead — not
-- skipped, not cancelled, not closed — and uses it for BOTH the filter and the
-- displayed date, so a live series stays findable and shows the date a player
-- would turn up on rather than the date somebody created the series.
--
-- ── KCDX-025: kind filtering after the global cap ────────────────────────
-- Each branch had a fixed limit (6,6,5,5,4,4,4,3) and the union was capped
-- globally; `app/search/actions.ts` then filtered by inferred kind AFTERWARDS.
-- So a search for courts competed against players, teams and tournaments for the
-- cap first, and was filtered to courts second — a query that should return six
-- courts could return two, because four slots went to rows the user never wanted
-- and which were then discarded.
--
-- The requested kinds are now a validated argument. Branches that were not asked
-- for are skipped before ranking rather than filtered after, and the per-branch
-- limits scale up when fewer kinds are requested, so a narrowed search fills the
-- page with what was actually asked for.
--
-- `p_kinds => null` keeps the previous behaviour exactly, so every existing
-- caller is unaffected until it opts in.

-- The old two-argument signature must GO, not coexist. Adding `p_kinds` with a
-- default creates a second function, and a two-argument call then matches both —
-- "function name is not unique", which would break every existing caller at
-- runtime rather than at deploy. Dropping first means there is exactly one.
drop function if exists public.global_search(text, integer);

create function public.global_search(
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
