-- 0054_tournament_ranking_points.sql — connect tournament finishes to the
-- per-sport community rankings.
--
-- Each row records the community ranking points a player earned from one division
-- of one tournament. player_sports.points (what the rankings screen ranks by) is
-- recomputed from this ledger as a rolling sum of a player's best results over the
-- last year — so old results age out and the board reflects recent form.
--
-- Points are a transparent, deterministic function of field size and finishing
-- place (see lib/ranking.ts). There are no organizer-set multipliers, so a draw
-- cannot be tilted to inflate points. The ledger is readable by everyone for
-- transparency; only the service role (via the award server action) may write it.

create table if not exists public.tournament_points (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  sport_key       text not null references public.sports(key),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  division_id     uuid not null references public.tournament_divisions(id) on delete cascade,
  registration_id uuid references public.tournament_registrations(id) on delete set null,
  points          int not null default 0 check (points >= 0),
  place           int,                                 -- final placement in the division (1 = champion)
  field_size      int,                                 -- entries in the division (for transparency)
  played          boolean not null default true,       -- false = rostered sub who didn't play (reduced share)
  earned_at       timestamptz not null default now(),  -- when the result counts from (rolling window)
  created_at      timestamptz not null default now(),
  unique (division_id, user_id)                         -- one row per player per division; re-award replaces
);

create index if not exists tournament_points_user_sport_idx on public.tournament_points (user_id, sport_key, earned_at desc);
create index if not exists tournament_points_division_idx    on public.tournament_points (division_id);
create index if not exists tournament_points_tournament_idx   on public.tournament_points (tournament_id);

alter table public.tournament_points enable row level security;

-- Readable by everyone (transparency: players can see how points were earned).
drop policy if exists "tournament_points readable" on public.tournament_points;
create policy "tournament_points readable" on public.tournament_points
  for select to authenticated using (true);

-- No insert/update/delete policy: writes happen only through the service role
-- (the awardTournamentPoints server action), which bypasses RLS.

grant select on public.tournament_points to authenticated;
