-- 0157_feed_algorithm.sql — Klimr's feed ranking engine.
--
-- RESEARCH BASIS (2026-07-30, sources in chat): every major platform has
-- converged on the same architecture — candidate generation → per-user
-- scoring → diversity re-rank. Instagram's Feed weighs RELATIONSHIP
-- strength (interaction history) above all; TikTok's defining choice is an
-- INTEREST graph (what you engage with, not who you follow), run as
-- candidates → prediction → ranking → similarity check for variety.
-- Klimr's advantage: our interest graph is EXPLICIT — player_sports holds
-- real play habits (matches_played, active sports), so nothing has to be
-- inferred from watch time.
--
-- THE MODEL (all set-based, all indexed, RLS-governed):
--   user_sport_affinity  — how much each member cares about each sport,
--     from play habits (matches played), explicit selection (active
--     player_sports + primary), and engagement (aces on sport posts,
--     event RSVPs). Normalized 0..1 per user.
--   user_author_affinity — how much each member cares about each author,
--     from aces given, comments written, follows, and friendships.
--     Top 300 authors per user, normalized 0..1.
--   Both refresh NIGHTLY via pg_cron (04:15 UTC): a set-based rebuild off
--   the hot path — the industry pattern for signals at scale.
--
-- get_ranked_feed(p_scope, p_limit) — INVOKER rights: posts RLS (audience
-- 0140/0142) still decides visibility; affinity tables are readable only
-- for one's own rows. Pipeline: last-21-day candidates (500, indexed) →
--   score = 1.8·recency(36h half-life) + 1.6·sport_affinity
--         + graph(2.2 friend / 1.2 follow) + 1.4·author_affinity
--         + 0.6·ln(1 + aces + 2·comments) + type nudge
-- → author-diversity penalty (−0.35 per extra consecutive slot, the
-- "similarity check") → top N.
--
-- ELIGIBILITY RULE (Gabriel's spec): members see posts for sports they
-- play — plus general (no-sport) posts and anything from their own graph
-- (a friend's post shows regardless of sport, the Instagram behavior).
-- Idempotent.

create table if not exists public.user_sport_affinity (
  user_id uuid not null,
  sport_key text not null,
  score real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, sport_key)
);
alter table public.user_sport_affinity enable row level security;
drop policy if exists "own sport affinity" on public.user_sport_affinity;
create policy "own sport affinity" on public.user_sport_affinity
  for select using (user_id = auth.uid());

create table if not exists public.user_author_affinity (
  user_id uuid not null,
  author_id uuid not null,
  score real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, author_id)
);
alter table public.user_author_affinity enable row level security;
drop policy if exists "own author affinity" on public.user_author_affinity;
create policy "own author affinity" on public.user_author_affinity
  for select using (user_id = auth.uid());

create index if not exists posts_feed_cand_idx on public.posts (created_at desc) where repost_of is null;
create index if not exists posts_sport_key_idx on public.posts (sport_key);
create index if not exists post_likes_post_idx on public.post_likes (post_id);
create index if not exists post_comments_post_idx on public.post_comments (post_id);
create index if not exists player_sports_user_active_idx on public.player_sports (user_id) where active;

create or replace function public.refresh_feed_affinities()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ── sport affinity: habits + selection + engagement ──
  insert into public.user_sport_affinity as t (user_id, sport_key, score, updated_at)
  select s.u, s.k, sum(s.pts)::real, now()
  from (
    select ps.user_id as u, ps.sport_key as k, 2.0 + 0.6 * ln(1 + ps.matches_played) as pts
      from public.player_sports ps where ps.active
    union all
    select p.id, p.primary_sport, 1.5 from public.profiles p where p.primary_sport is not null
    union all
    select pl.user_id, po.sport_key, 0.4
      from public.post_likes pl join public.posts po on po.id = pl.post_id
      where po.sport_key is not null and pl.created_at > now() - interval '90 days'
    union all
    select r.user_id, e.sport_key, 0.5
      from public.event_rsvps r join public.events e on e.id = r.event_id
      where e.sport_key is not null
  ) s
  group by s.u, s.k
  on conflict (user_id, sport_key) do update set score = excluded.score, updated_at = now();

  update public.user_sport_affinity a
  set score = (a.score / m.mx)::real
  from (select user_id, max(score) as mx from public.user_sport_affinity group by user_id) m
  where m.user_id = a.user_id and m.mx > 0;

  -- ── author affinity: interaction history + graph (top 300 per user) ──
  delete from public.user_author_affinity;
  insert into public.user_author_affinity (user_id, author_id, score, updated_at)
  select q.u, q.a, q.sc::real, now()
  from (
    select s.u, s.a, sum(s.pts) as sc,
           row_number() over (partition by s.u order by sum(s.pts) desc) as rn
    from (
      select pl.user_id as u, po.author_id as a, 1.0 as pts
        from public.post_likes pl join public.posts po on po.id = pl.post_id
        where pl.created_at > now() - interval '90 days' and po.author_id <> pl.user_id
      union all
      select pc.author_id, po.author_id, 2.0
        from public.post_comments pc join public.posts po on po.id = pc.post_id
        where pc.created_at > now() - interval '90 days' and po.author_id <> pc.author_id
      union all
      select f.follower_id, f.followee_id, 1.5 from public.follows f
      union all
      select fr.requester_id, fr.addressee_id, 2.5 from public.friendships fr where fr.status = 'accepted'
      union all
      select fr.addressee_id, fr.requester_id, 2.5 from public.friendships fr where fr.status = 'accepted'
    ) s
    group by s.u, s.a
  ) q
  where q.rn <= 300;

  update public.user_author_affinity a
  set score = (a.score / m.mx)::real
  from (select user_id, max(score) as mx from public.user_author_affinity group by user_id) m
  where m.user_id = a.user_id and m.mx > 0;
end;
$$;

revoke all on function public.refresh_feed_affinities() from public;
revoke all on function public.refresh_feed_affinities() from authenticated;
grant execute on function public.refresh_feed_affinities() to service_role;

drop function if exists public.get_ranked_feed(text, int);
create function public.get_ranked_feed(p_scope text default 'all', p_limit int default 60)
returns table (id uuid, score real)
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
scored as (
  select c.id, c.author_id, c.created_at,
    ( 1.8 * exp(-extract(epoch from (now() - c.created_at)) / 3600.0 / 36.0)
    + 1.6 * coalesce(sa.score, 0)
    + coalesce((select g.w from graph g where g.pid = c.author_id limit 1), 0)
    + 1.4 * coalesce(aa.score, 0)
    + 0.6 * ln(1
        + (select count(*) from public.post_likes pl where pl.post_id = c.id)
        + 2 * (select count(*) from public.post_comments pc where pc.post_id = c.id))
    + case when c.post_type = 'milestone' then 0.2 else 0 end
    )::real as base
  from cand c
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
select d.id, d.score
from divers d
order by d.score desc, d.created_at desc
limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_ranked_feed(text, int) from public;
grant execute on function public.get_ranked_feed(text, int) to authenticated;

-- ── nightly signal refresh + immediate bootstrap ──
do $$
begin
  -- 0227/0231: the SCHEDULING guard tests the function about to be called, not
  -- a proxy for it. Extension creation still depends on availability; scheduling
  -- does not, so the CI harness (which shims `cron.schedule`) exercises the same
  -- path production takes instead of silently skipping it.
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule(
      'refresh-feed-affinities-nightly',
      '15 4 * * *',
      'select public.refresh_feed_affinities()'
    );
  else
    raise notice 'pg_cron unavailable — enable it (Database → Extensions) and re-run to schedule the nightly affinity refresh.';
  end if;
end;
$$;

select public.refresh_feed_affinities();
