-- 0154_search_quality.sql — search quality pass from Gabriel's three
-- production screenshots.
--   (1) STEMMING: 'simple' config can't match dietitians→dietitian or
--       events→event. Every search_tsv is rebuilt on the 'english' stemmer
--       (the industry norm for title search); queries switch to match.
--   (2) PROVIDER ROLES: the provider index only covered headline — a
--       dietitian without the word in their headline was unfindable. Roles
--       now index too.
--   (3) RECENCY: quick results surfaced PAST events and missed upcoming
--       ones. The events branch now returns upcoming only (yesterday
--       onward), soonest-first within equal rank; tournaments order
--       upcoming-first without hiding history (past tournaments stay
--       findable for results lookups).
-- Generated columns rebuild themselves; dropping and re-adding re-indexes
-- every existing row automatically. Idempotent.

drop function if exists public.global_search(text, int);

-- array_to_string is STABLE, not IMMUTABLE, so it can't power a generated
-- column directly; for text[] it IS deterministic — the standard wrapper:
create or replace function public.immutable_array_to_text(text[])
returns text language sql immutable as $$ select array_to_string($1, ' ') $$;

alter table public.profiles drop column if exists search_tsv;
alter table public.profiles add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(display_name, ''))) stored;
create index if not exists profiles_search_tsv_idx on public.profiles using gin (search_tsv);

alter table public.courts drop column if exists search_tsv;
alter table public.courts add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(neighborhood,'') || ' ' || coalesce(city,''))) stored;
create index if not exists courts_search_tsv_idx on public.courts using gin (search_tsv);

alter table public.teams drop column if exists search_tsv;
alter table public.teams add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(name, ''))) stored;
create index if not exists teams_search_tsv_idx on public.teams using gin (search_tsv);

alter table public.events drop column if exists search_tsv;
alter table public.events add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, ''))) stored;
create index if not exists events_search_tsv_idx on public.events using gin (search_tsv);

alter table public.tournaments drop column if exists search_tsv;
alter table public.tournaments add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, ''))) stored;
create index if not exists tournaments_search_tsv_idx on public.tournaments using gin (search_tsv);

alter table public.marketplace_listings drop column if exists search_tsv;
alter table public.marketplace_listings add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(category,''))) stored;
create index if not exists listings_search_tsv_idx on public.marketplace_listings using gin (search_tsv);

alter table public.classes drop column if exists search_tsv;
alter table public.classes add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, ''))) stored;
create index if not exists classes_search_tsv_idx on public.classes using gin (search_tsv);

alter table public.class_providers drop column if exists search_tsv;
alter table public.class_providers add column search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(headline,'') || ' ' || public.immutable_array_to_text(coalesce(roles, '{}')))) stored;
create index if not exists providers_search_tsv_idx on public.class_providers using gin (search_tsv);

create function public.global_search(p_q text, p_limit int default 24)
returns table (kind text, id text, title text, subtitle text, rank real)
language sql stable as $$
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
  where char_length(q.raw) >= 2
    and e.status in ('active', 'published')
    and e.starts_at >= now() - interval '1 day'
    and (e.search_tsv @@ q.tsq or e.title ilike q.raw || '%' or similarity(e.title, q.raw) > 0.3)
  order by 5 desc, e.starts_at asc limit 5
) d
union all
select * from (
  select 'tournament', t.code, t.title, t.sport_key,
         greatest(ts_rank(t.search_tsv, q.tsq), similarity(t.title, q.raw))::real
  from public.tournaments t, q
  where char_length(q.raw) >= 2
    and (t.search_tsv @@ q.tsq or t.title ilike q.raw || '%' or similarity(t.title, q.raw) > 0.3)
  order by 5 desc, (t.starts_at >= now() - interval '1 day') desc, t.starts_at asc limit 4
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
