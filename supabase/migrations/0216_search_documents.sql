-- 0216_search_documents.sql — KCDX-020 and KCDX-021 (P1): search documents omit
-- key attributes, published businesses, and provider names.
--
-- ── WHAT IS IN THE INDEX TODAY ───────────────────────────────────────────
-- Almost nothing but names. `events` indexes `title` alone — not the description
-- that says what the session actually is. `teams` indexes `name` alone, though
-- the table carries city and neighbourhood. `tournaments` indexes `title` while
-- holding a description and a venue. `classes` the same. And
-- `business_accounts` has no search document and no branch in `global_search` at
-- all — a published business is unfindable by name.
--
-- The practical effect is that search only works when a member already knows
-- what something is called. "Brazilian night doubles in Mar Vista" matches
-- nothing unless those words happen to be in the title.
--
-- ── KCDX-021: a coach cannot be found by their name ──────────────────────
-- `class_providers.search_tsv` indexes `headline` and `roles`. The provider's
-- actual NAME lives on `profiles.display_name`, and a generated column cannot
-- reach another table — so searching for a coach by name matches only if their
-- name happens to appear in their own headline.
--
-- A generated column cannot do it, so `public_name` is maintained by trigger
-- from both sides: when a provider row is written, and when a profile's display
-- name changes. Denormalisation with a maintained invariant, not a cache with a
-- TTL — the value is only ever wrong for the duration of a transaction.
--
-- ── PRIVACY REVIEW, since these are documents about people ───────────────
-- Only fields already rendered on the corresponding PUBLIC surface go in:
--   events        title, description, sport            (shown on the event page)
--   teams         name, city, neighbourhood, sport      (shown on the team card)
--   tournaments   title, description, venue, sport      (shown on the microsite)
--   classes       title, description, venue, sport      (shown on the class page)
--   providers     headline, roles, area, PUBLIC NAME    (shown on the provider card)
--   businesses    name, headline, area, sports          (shown on the listing)
-- Deliberately NOT indexed: anything from `profile_private`, member ZIPs,
-- `bio` on providers (free text people treat as personal), and any unpublished
-- or draft row. Indexing is a discoverability decision, and 0215 is the reason
-- it can be made separately from readability.

-- ── 1. richer documents for the entities that had titles only ────────────
alter table public.events drop column if exists search_tsv;
alter table public.events add column search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(sport_key,''))) stored;
create index if not exists events_search_tsv_idx on public.events using gin (search_tsv);

alter table public.teams drop column if exists search_tsv;
alter table public.teams add column search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(name,'') || ' ' || coalesce(city,'') || ' ' || coalesce(neighborhood,'') || ' ' || coalesce(sport_key,''))) stored;
create index if not exists teams_search_tsv_idx on public.teams using gin (search_tsv);

alter table public.tournaments drop column if exists search_tsv;
alter table public.tournaments add column search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(location_name,'') || ' ' || coalesce(sport_key,''))) stored;
create index if not exists tournaments_search_tsv_idx on public.tournaments using gin (search_tsv);

alter table public.classes drop column if exists search_tsv;
alter table public.classes add column search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(location_name,'') || ' ' || coalesce(sport_key,''))) stored;
create index if not exists classes_search_tsv_idx on public.classes using gin (search_tsv);

-- ── 2. providers become findable by name (KCDX-021) ──────────────────────
alter table public.class_providers
  add column if not exists public_name text;

create or replace function public.sync_provider_public_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'class_providers' then
    select display_name into new.public_name from public.profiles where id = new.user_id;
    return new;
  end if;
  -- profiles: the name changed, so every provider row for that person follows.
  update public.class_providers set public_name = new.display_name where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists class_providers_public_name on public.class_providers;
create trigger class_providers_public_name
  before insert or update of user_id on public.class_providers
  for each row execute function public.sync_provider_public_name();

drop trigger if exists profiles_sync_provider_name on public.profiles;
create trigger profiles_sync_provider_name
  after update of display_name on public.profiles
  for each row when (new.display_name is distinct from old.display_name)
  execute function public.sync_provider_public_name();

update public.class_providers cp
   set public_name = p.display_name
  from public.profiles p
 where p.id = cp.user_id and cp.public_name is distinct from p.display_name;

alter table public.class_providers drop column if exists search_tsv;
alter table public.class_providers add column search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(public_name,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(area_text,'') || ' ' ||
    public.immutable_array_to_text(coalesce(roles, '{}')))) stored;
create index if not exists providers_search_tsv_idx on public.class_providers using gin (search_tsv);

-- ── 3. published businesses become searchable at all ─────────────────────
alter table public.business_accounts drop column if exists search_tsv;
alter table public.business_accounts add column search_tsv tsvector
  generated always as (to_tsvector('english',
    coalesce(name,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(area_text,'') || ' ' ||
    public.immutable_array_to_text(coalesce(sports, '{}')))) stored;
create index if not exists businesses_search_tsv_idx on public.business_accounts using gin (search_tsv);

-- ── 4. the branch, so a published business can be found ─────────────────
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
               then array['player','court','team','event','tournament','listing','class','provider','business']
             else array(
               select k from unnest(p_kinds) k
                where k = any(array['player','court','team','event','tournament','listing','class','provider','business'])
             )
           end as kinds
  ),
  scale as (
    -- Fewer kinds asked for, more room for each. Capped at 4x so a single-kind
    -- search cannot make one branch scan far more than the page can show.
    select kinds,
           greatest(1, least(4, 9 / greatest(1, cardinality(kinds))))::int as per_kind
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
    union all
    select * from (
      -- KCDX-020: `business_accounts` had no search document and no branch at
      -- all, so a published business was unfindable by name. Only PUBLISHED and
      -- ACTIVE rows: a draft is not a public surface, and 0201's guard means a
      -- member cannot self-publish into this branch.
      select 'business', b.id::text, b.name, coalesce(b.area_text, b.headline),
             greatest(ts_rank(b.search_tsv, q.tsq), similarity(b.name, q.raw))::real
      from public.business_accounts b, q
      where char_length(q.raw) >= 2
        and 'business' = any(kinds)
        and b.published = true
        and b.status = 'active'
        and (b.search_tsv @@ q.tsq or b.name ilike q.raw || '%' or similarity(b.name, q.raw) > 0.3)
      order by 5 desc limit (4 * per_kind)
    ) i
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
