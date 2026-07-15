-- 0120_activity_gate_rank_history.sql — inactivity policy + permanent history.
-- (1) player_sports.last_result_at (backfilled from both ledgers) — the
--     activity signal.
-- (2) ranked_players gains the APPROVED 180-day visibility gate + returns
--     last_result_at for the "last played" chip. Points are untouched; one
--     new result and a player reappears instantly. Percentiles/challenges
--     derived from this RPC become active-cohort by construction.
-- (3) rank_history — one row per player/sport/week (points + rank), written
--     nightly by the snapshot job (the current week's row converges to its
--     end-of-week value). Backfilled points-only (rank unknowable in
--     hindsight) from the ledgers so existing members see their climb
--     immediately. Feeds the profile history graph: the ladder forgets
--     inactive players after 180 days — the profile never does.

-- ── (1) activity signal ──────────────────────────────────────────────────
alter table public.player_sports
  add column if not exists last_result_at timestamptz;

update public.player_sports ps
set last_result_at = sub.m
from (
  select user_id, sport_key, max(earned_at) as m
  from (
    select user_id, sport_key, earned_at from public.queue_points
    union all
    select user_id, sport_key, earned_at from public.tournament_points
  ) u
  group by user_id, sport_key
) sub
where sub.user_id = ps.user_id and sub.sport_key = ps.sport_key;

create index if not exists player_sports_activity_idx
  on public.player_sports (sport_key, last_result_at desc, points desc);

-- ── (2) the 180-day ladder gate ──────────────────────────────────────────
drop function if exists public.ranked_players(text, text, text);
create or replace function public.ranked_players(
  p_sport text,
  p_scope text default 'world',
  p_region text default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_hue int,
  verification_status public.verification_status,
  points int,
  skill_rating numeric,
  matches_played int,
  wins int,
  last_result_at timestamptz,
  rank bigint
)
language sql stable
set search_path = public
as $$
  select
    ps.user_id,
    pr.display_name,
    pr.avatar_hue,
    pr.verification_status,
    ps.points,
    ps.skill_rating,
    ps.matches_played,
    ps.wins,
    ps.last_result_at,
    rank() over (order by ps.points desc)
  from public.player_sports ps
  join public.profiles pr on pr.id = ps.user_id
  where ps.sport_key = p_sport
    and pr.account_status <> 'archived'
    and ps.last_result_at >= now() - interval '180 days'
    and case p_scope
      when 'world' then true
      when 'national' then pr.country is not distinct from coalesce(p_region, pr.country)
      when 'state' then pr.state is not distinct from p_region
      when 'city' then pr.city is not distinct from p_region
      when 'neighborhood' then pr.neighborhood is not distinct from p_region
      when 'zip' then pr.home_zip is not distinct from p_region
      else false
    end
  order by ps.points desc;
$$;
grant execute on function public.ranked_players(text, text, text) to authenticated;

-- ── (3) permanent weekly history ─────────────────────────────────────────
create table if not exists public.rank_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport_key text not null,
  week date not null,
  points integer not null,
  rank integer,
  primary key (user_id, sport_key, week)
);
alter table public.rank_history enable row level security;
create policy "rank_history_read" on public.rank_history
  for select to authenticated using (true);

-- backfill: points-only weekly series per player/sport (rank unknowable in hindsight)
insert into public.rank_history (user_id, sport_key, week, points, rank)
select u.user_id, u.sport_key, w.week::date, t.pts, null
from (
  select user_id, sport_key, min(earned_at) as mn
  from (
    select user_id, sport_key, earned_at from public.queue_points
    union all
    select user_id, sport_key, earned_at from public.tournament_points
  ) x
  group by user_id, sport_key
) u
cross join lateral generate_series(
  date_trunc('week', u.mn)::date,
  date_trunc('week', now())::date,
  interval '7 days'
) as w(week)
cross join lateral (
  select coalesce(sum(p), 0)::int as pts from (
    select rr.points as p
    from (
      select points, earned_at from public.queue_points q
        where q.user_id = u.user_id and q.sport_key = u.sport_key
      union all
      select points, earned_at from public.tournament_points tp
        where tp.user_id = u.user_id and tp.sport_key = u.sport_key
    ) rr
    where rr.earned_at >  w.week::timestamptz + interval '7 days' - interval '52 weeks'
      and rr.earned_at <= w.week::timestamptz + interval '7 days'
    order by rr.points desc
    limit 8
  ) top8
) t
where t.pts > 0
on conflict (user_id, sport_key, week) do nothing;

-- ── (4) snapshot job v3: also maintain the current week's history row ────
create or replace function public.snapshot_and_emit_ranking_moves()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare today date := current_date;
declare prev date;
begin
  insert into public.rank_snapshots (snap_date, user_id, sport_key, points, rank)
  select today, ps.user_id, ps.sport_key, ps.points::int,
         rank() over (partition by ps.sport_key order by ps.points desc)::int
  from public.player_sports ps
  where ps.points > 0
  on conflict (snap_date, user_id, sport_key) do update
    set points = excluded.points, rank = excluded.rank;

  -- permanent history: the current ISO week's row converges to end-of-week
  insert into public.rank_history (user_id, sport_key, week, points, rank)
  select s.user_id, s.sport_key, date_trunc('week', today)::date, s.points, s.rank
  from public.rank_snapshots s
  where s.snap_date = today
  on conflict (user_id, sport_key, week) do update
    set points = excluded.points, rank = excluded.rank;

  select max(snap_date) into prev from public.rank_snapshots where snap_date < today;
  if prev is null then return; end if;

  perform public.feed_emit(
    'ranking_move', cur.user_id, p.home_zip, 'ranking', cur.user_id,
    jsonb_build_object('sport', cur.sport_key, 'from', old.rank, 'to', cur.rank, 'climbed', old.rank - cur.rank),
    'ranking_move:' || cur.user_id || ':' || cur.sport_key || ':' || today,
    'region', cur.sport_key)
  from public.rank_snapshots cur
  join public.rank_snapshots old
    on old.snap_date = prev and old.user_id = cur.user_id and old.sport_key = cur.sport_key
  join public.profiles p on p.id = cur.user_id
  where cur.snap_date = today
    and cur.rank <= 200
    and old.rank - cur.rank >= 5
    and p.home_zip is not null;

  delete from public.rank_snapshots where snap_date < today - interval '14 days';
end $$;
