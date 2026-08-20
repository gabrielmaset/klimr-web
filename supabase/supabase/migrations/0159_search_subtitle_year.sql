-- 0159_search_subtitle_year.sql — event quick-result subtitles carry the
-- year (events schedule months out; 'Aug 16' alone is ambiguous across
-- year boundaries). Re-creates global_search from 0154 with the single
-- to_char change; everything else identical. Idempotent.

drop function if exists public.global_search(text, int);

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
  select 'event', e.id::text, e.title, to_char(e.starts_at, 'Mon DD, YYYY'),
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
