-- 0014_teams.sql — player teams (e.g. a local crew or club squad for a sport),
-- membership, and invitations. Idempotent.
--
-- Reads: team + roster info is visible to any signed-in user. Writes to membership
-- happen through server actions (service role) after validation; users can leave
-- (delete own membership) and respond to their own invites.

create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sport_key    text not null references public.sports(key),
  city         text,
  neighborhood text,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.teams enable row level security;

drop policy if exists "teams readable" on public.teams;
create policy "teams readable" on public.teams
  for select using (auth.role() = 'authenticated');

drop policy if exists "teams insert own" on public.teams;
create policy "teams insert own" on public.teams
  for insert with check (created_by = auth.uid());

drop policy if exists "teams update captain" on public.teams;
create policy "teams update captain" on public.teams
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "teams delete captain" on public.teams;
create policy "teams delete captain" on public.teams
  for delete using (created_by = auth.uid());

create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members (user_id);
alter table public.team_members enable row level security;

drop policy if exists "members readable" on public.team_members;
create policy "members readable" on public.team_members
  for select using (auth.role() = 'authenticated');

-- A player can leave (delete their own row). Adds/removes-by-captain go via service role.
drop policy if exists "members leave own" on public.team_members;
create policy "members leave own" on public.team_members
  for delete using (user_id = auth.uid());

create table if not exists public.team_invites (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (team_id, invited_user_id)
);
create index if not exists team_invites_invited_idx on public.team_invites (invited_user_id);
alter table public.team_invites enable row level security;

-- The invited player and the inviter can see an invite.
drop policy if exists "invites readable" on public.team_invites;
create policy "invites readable" on public.team_invites
  for select using (invited_user_id = auth.uid() or invited_by = auth.uid());

-- The invited player accepts/declines their own invite. Creation goes via service role.
drop policy if exists "invites respond" on public.team_invites;
create policy "invites respond" on public.team_invites
  for update using (invited_user_id = auth.uid()) with check (invited_user_id = auth.uid());
