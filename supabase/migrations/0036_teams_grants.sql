-- 0036_teams_grants.sql
-- Make the service-role grants on the team tables explicit so server-side
-- membership/invite writes succeed (mirrors the courts/feed fixes). Also
-- re-asserts the tables/RLS from 0014 so nothing is missing. Idempotent.

-- Tables (no-ops if 0014 already created them).
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sport_key    text not null references public.sports(key),
  city         text,
  neighborhood text,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create table if not exists public.team_invites (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (team_id, invited_user_id)
);

-- Service-role writes happen in server actions (captain adds/removes members,
-- creates invites). Make the grant explicit in case defaults didn't cover it.
grant all on public.teams to service_role;
grant all on public.team_members to service_role;
grant all on public.team_invites to service_role;
