-- 0086_queue_points.sql — pickup (King of the Court) matches feed the community rankings.
--
-- One row per logged-in player per finished queue match. player_sports.points (what the
-- rankings screen ranks by) is recomputed from BOTH this ledger and tournament_points as
-- a rolling best-N sum (see lib/points.ts + lib/ranking.ts), so casual play is a modest
-- on-ramp to the board without letting anyone out-grind real tournament finishes.
-- Points are a transparent, deterministic function of win/loss; the ledger is readable by
-- everyone for transparency and only the service role (the award path) may write it.

create table if not exists public.queue_points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  sport_key   text not null references public.sports(key),
  session_id  uuid references public.court_sessions(id) on delete set null,
  match_id    uuid references public.queue_matches(id) on delete set null,
  points      int  not null default 0 check (points >= 0),
  won         boolean not null default false,
  earned_at   timestamptz not null default now(),  -- when the result counts from (rolling window)
  created_at  timestamptz not null default now(),
  unique (match_id, user_id)                        -- one row per player per match; re-award replaces
);

create index if not exists queue_points_user_sport_idx on public.queue_points (user_id, sport_key, earned_at desc);
create index if not exists queue_points_session_idx     on public.queue_points (session_id);

alter table public.queue_points enable row level security;

drop policy if exists "queue_points readable" on public.queue_points;
create policy "queue_points readable" on public.queue_points
  for select to authenticated using (true);

-- No insert/update/delete policy: writes happen only through the service role.
grant select on public.queue_points to authenticated;
