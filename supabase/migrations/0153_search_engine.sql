-- 0153_search_engine.sql — the real search engine (Gabriel's mandate after
-- the Live Queue miss proved hand-maintained indexes rot).
--
-- RESEARCH VERDICT: external engines (Algolia/Typesense/Elastic) index data
-- OUTSIDE Postgres and would force re-implementing RLS as app-layer filter
-- tokens — the exact security class Klimr bans. The professional fit is
-- Postgres's own engine: tsvector GENERATED COLUMNS (the index maintains
-- ITSELF on every write — automatic, forever), GIN indexes (millions-of-rows
-- scale), pg_trgm (typo tolerance), one INVOKER-rights RPC so every query
-- runs as the caller under RLS. Supabase's own recommendation.
--
-- Adding a future searchable table = one generated column + two indexes +
-- one UNION branch. Idempotent.

create extension if not exists pg_trgm;

-- ── self-maintaining index columns ──────────────────────────────────────
alter table public.profiles add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(display_name, ''))) stored;
create index if not exists profiles_search_tsv_idx on public.profiles using gin (search_tsv);
create index if not exists profiles_name_trgm_idx on public.profiles using gin (display_name gin_trgm_ops);

alter table public.courts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(neighborhood,'') || ' ' || coalesce(city,''))) stored;
create index if not exists courts_search_tsv_idx on public.courts using gin (search_tsv);
create index if not exists courts_name_trgm_idx on public.courts using gin (name gin_trgm_ops);

alter table public.teams add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(name, ''))) stored;
create index if not exists teams_search_tsv_idx on public.teams using gin (search_tsv);
create index if not exists teams_name_trgm_idx on public.teams using gin (name gin_trgm_ops);

alter table public.events add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title, ''))) stored;
create index if not exists events_search_tsv_idx on public.events using gin (search_tsv);
create index if not exists events_title_trgm_idx on public.events using gin (title gin_trgm_ops);

alter table public.tournaments add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title, ''))) stored;
create index if not exists tournaments_search_tsv_idx on public.tournaments using gin (search_tsv);
create index if not exists tournaments_title_trgm_idx on public.tournaments using gin (title gin_trgm_ops);

alter table public.marketplace_listings add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(category,''))) stored;
create index if not exists listings_search_tsv_idx on public.marketplace_listings using gin (search_tsv);
create index if not exists listings_title_trgm_idx on public.marketplace_listings using gin (title gin_trgm_ops);

alter table public.classes add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title, ''))) stored;
create index if not exists classes_search_tsv_idx on public.classes using gin (search_tsv);
create index if not exists classes_title_trgm_idx on public.classes using gin (title gin_trgm_ops);

alter table public.class_providers add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(headline, ''))) stored;
create index if not exists providers_search_tsv_idx on public.class_providers using gin (search_tsv);

-- ── ONE search RPC — INVOKER rights: RLS decides visibility per caller ──
drop function if exists public.global_search(text, int);
create function public.global_search(p_q text, p_limit int default 24)
returns table (kind text, id text, title text, subtitle text, rank real)
language sql stable as $$
with q as (
  select websearch_to_tsquery('simple', p_q) as tsq,
         nullif(trim(p_q), '') as raw
)
select * from (
  select 'player'::text as kind, p.id::text, p.display_name as title,
         p.primary_sport as subtitle,
         greatest(ts_rank(p.search_tsv, q.tsq), similarity(p.display_name, q.raw))::real as rank
  from public.profiles p, q
  where char_length(q.raw) >= 2
    and (p.search_tsv @@ q.tsq or p.display_name ilike q.raw || '%' or similarity(p.display_name, q.raw) > 0.3)
  order by rank desc limit 6
) a
union all
select * from (
  select 'court', c.id::text, c.name, coalesce(c.neighborhood, c.city),
         greatest(ts_rank(c.search_tsv, q.tsq), similarity(c.name, q.raw))::real
  from public.courts c, q
  where char_length(q.raw) >= 2 and c.is_active and c.is_private = false
    and (c.search_tsv @@ q.tsq or c.name ilike q.raw || '%' or similarity(c.name, q.raw) > 0.3)
  order by 5 desc limit 6
) b
union all
select * from (
  select 'team', t.id::text, t.name, t.sport_key,
         greatest(ts_rank(t.search_tsv, q.tsq), similarity(t.name, q.raw))::real
  from public.teams t, q
  where char_length(q.raw) >= 2
    and (t.search_tsv @@ q.tsq or t.name ilike q.raw || '%' or similarity(t.name, q.raw) > 0.3)
  order by 5 desc limit 5
) c
union all
select * from (
  select 'event', e.id::text, e.title, to_char(e.starts_at, 'Mon DD'),
         greatest(ts_rank(e.search_tsv, q.tsq), similarity(e.title, q.raw))::real
  from public.events e, q
  where char_length(q.raw) >= 2 and e.status in ('active', 'published')
    and (e.search_tsv @@ q.tsq or e.title ilike q.raw || '%' or similarity(e.title, q.raw) > 0.3)
  order by 5 desc limit 5
) d
union all
select * from (
  select 'tournament', t.code, t.title, t.sport_key,
         greatest(ts_rank(t.search_tsv, q.tsq), similarity(t.title, q.raw))::real
  from public.tournaments t, q
  where char_length(q.raw) >= 2
    and (t.search_tsv @@ q.tsq or t.title ilike q.raw || '%' or similarity(t.title, q.raw) > 0.3)
  order by 5 desc limit 4
) e
union all
select * from (
  select 'listing', l.id::text, l.title,
         coalesce(l.price_text, case when l.price_cents is not null then '$' || (l.price_cents / 100)::int else null end),
         greatest(ts_rank(l.search_tsv, q.tsq), similarity(l.title, q.raw))::real
  from public.marketplace_listings l, q
  where char_length(q.raw) >= 2 and l.status = 'active'
    and (l.search_tsv @@ q.tsq or l.title ilike q.raw || '%' or similarity(l.title, q.raw) > 0.3)
  order by 5 desc limit 4
) f
union all
select * from (
  select 'class', cl.id::text, cl.title, cl.sport_key,
         greatest(ts_rank(cl.search_tsv, q.tsq), similarity(cl.title, q.raw))::real
  from public.classes cl, q
  where char_length(q.raw) >= 2 and cl.status = 'published'
    and (cl.search_tsv @@ q.tsq or cl.title ilike q.raw || '%' or similarity(cl.title, q.raw) > 0.3)
  order by 5 desc limit 4
) g
union all
select * from (
  select 'provider', cp.user_id::text, coalesce(cp.headline, 'Verified provider'),
         array_to_string(cp.roles, ', '),
         greatest(ts_rank(cp.search_tsv, q.tsq), similarity(coalesce(cp.headline, ''), q.raw))::real
  from public.class_providers cp, q
  where char_length(q.raw) >= 2 and cp.status = 'approved'
    and (cp.search_tsv @@ q.tsq or coalesce(cp.headline, '') ilike q.raw || '%' or similarity(coalesce(cp.headline, ''), q.raw) > 0.3)
  order by 5 desc limit 3
) h
order by rank desc
limit greatest(1, least(p_limit, 40));
$$;

revoke all on function public.global_search(text, int) from public;
grant execute on function public.global_search(text, int) to authenticated;
