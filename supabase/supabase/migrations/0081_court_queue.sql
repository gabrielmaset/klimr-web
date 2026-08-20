-- 0081_court_queue.sql — "King of the Court" live pickup queue.
--   A court_session (a day of pickup play, optionally tied to an event) has one or
--   more queue_courts, each with a formation (team_size) and descriptive levels.
--   Players join a court; the system finds-or-creates a forming queue_team and adds
--   them; when the team fills it enters that court's queue (queued_at). queue_matches
--   pair two teams; on "game over" the loser disbands and the winner stays until it
--   reaches win_cap wins, then it re-forms (king of the court). Walk-up guests (no
--   account) can be added with a location check. Idempotent.
--
-- Writes happen through server actions (service role) after validation; reads are
-- open to any signed-in member (queues are visible at the venue / on signage).

-- ===== sessions =====
create table if not exists public.court_sessions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,                                   -- short public code for the walk-up link
  event_id         uuid references public.events(id) on delete set null,
  organizer_id     uuid not null references public.profiles(id) on delete cascade,
  title            text not null default 'Pickup session',
  sport_key        text not null references public.sports(key),
  status           text not null default 'setup' check (status in ('setup','live','ended')),
  win_cap          int  not null default 1 check (win_cap between 1 and 10),  -- consecutive wins before a team re-forms
  center_lat       double precision,
  center_lng       double precision,
  radius_m         int  not null default 500 check (radius_m between 50 and 50000),
  allow_guests     boolean not null default true,                          -- walk-ups (no account) may join
  require_location boolean not null default true,                          -- joiners must be within radius
  created_at       timestamptz not null default now(),
  ended_at         timestamptz
);
create index if not exists court_sessions_organizer_idx on public.court_sessions (organizer_id, status);
create index if not exists court_sessions_event_idx on public.court_sessions (event_id);

-- ===== courts within a session =====
create table if not exists public.queue_courts (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.court_sessions(id) on delete cascade,
  label      text not null default 'Court',
  team_size  int  not null default 4 check (team_size between 1 and 8),    -- formation (3 = 3v3, etc.)
  levels     text[] not null default '{}',                                 -- descriptive: beginner/intermediate/advanced; empty = all
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists queue_courts_session_idx on public.queue_courts (session_id, sort);

-- ===== teams (play-once, formed first-come) =====
create table if not exists public.queue_teams (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.court_sessions(id) on delete cascade,
  court_id   uuid not null references public.queue_courts(id) on delete cascade,
  status     text not null default 'forming' check (status in ('forming','queued','playing','done')),
  wins       int  not null default 0 check (wins >= 0),
  hold_court boolean not null default false,                               -- true while a winner waits to play the next challenger
  queued_at  timestamptz,                                                  -- set when the team fills and enters the queue
  created_at timestamptz not null default now()
);
create index if not exists queue_teams_court_status_idx on public.queue_teams (court_id, status, queued_at);
create index if not exists queue_teams_session_idx on public.queue_teams (session_id, status);

-- ===== team members (accounts or walk-up guests) =====
create table if not exists public.queue_team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.queue_teams(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  guest_name text,
  joined_at  timestamptz not null default now(),
  check (user_id is not null or guest_name is not null)
);
create unique index if not exists queue_team_members_user_uq on public.queue_team_members (team_id, user_id) where user_id is not null;
create index if not exists queue_team_members_team_idx on public.queue_team_members (team_id);
create index if not exists queue_team_members_user_idx on public.queue_team_members (user_id);

-- ===== matches =====
create table if not exists public.queue_matches (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.court_sessions(id) on delete cascade,
  court_id    uuid not null references public.queue_courts(id) on delete cascade,
  team_a      uuid not null references public.queue_teams(id) on delete cascade,
  team_b      uuid not null references public.queue_teams(id) on delete cascade,
  status      text not null default 'live' check (status in ('live','final')),
  winner_team uuid references public.queue_teams(id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists queue_matches_court_idx on public.queue_matches (court_id, status, started_at desc);
-- only one live match per court at a time
create unique index if not exists queue_matches_one_live_per_court on public.queue_matches (court_id) where status = 'live';

-- ===== RLS: signed-in members can read; writes go through service-role actions =====
alter table public.court_sessions    enable row level security;
alter table public.queue_courts      enable row level security;
alter table public.queue_teams       enable row level security;
alter table public.queue_team_members enable row level security;
alter table public.queue_matches     enable row level security;

drop policy if exists "court_sessions readable" on public.court_sessions;
create policy "court_sessions readable" on public.court_sessions for select using (auth.role() = 'authenticated');
drop policy if exists "queue_courts readable" on public.queue_courts;
create policy "queue_courts readable" on public.queue_courts for select using (auth.role() = 'authenticated');
drop policy if exists "queue_teams readable" on public.queue_teams;
create policy "queue_teams readable" on public.queue_teams for select using (auth.role() = 'authenticated');
drop policy if exists "queue_team_members readable" on public.queue_team_members;
create policy "queue_team_members readable" on public.queue_team_members for select using (auth.role() = 'authenticated');
drop policy if exists "queue_matches readable" on public.queue_matches;
create policy "queue_matches readable" on public.queue_matches for select using (auth.role() = 'authenticated');

grant select on public.court_sessions, public.queue_courts, public.queue_teams, public.queue_team_members, public.queue_matches to authenticated;
grant all on public.court_sessions, public.queue_courts, public.queue_teams, public.queue_team_members, public.queue_matches to service_role;
