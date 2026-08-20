-- 0052_tournament_competition.sql — pools, seeding, and matches.
--
-- Competition runs per DIVISION. One set of tables backs two shapes:
--   • Pools / round-robin: entries are seeded into groups (pools); matches carry
--     a group_id, and everyone in a pool plays everyone else.
--   • Knockout brackets: matches carry round + slot + a next_match_id link so the
--     winner advances; entry slots can be TBD (null) until a feeder match ends.
--
-- Visibility matches the rest of the tournament: staff read+write; the public can
-- read once the tournament is visible, so schedules/brackets can show on the event
-- page later. New tables inherit role GRANTs from the default privileges set in
-- migration 0043. Idempotent.

create table if not exists public.tournament_groups (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  division_id   uuid not null references public.tournament_divisions(id) on delete cascade,
  name          text not null,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_groups_division on public.tournament_groups(division_id);

create table if not exists public.tournament_group_entries (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.tournament_groups(id) on delete cascade,
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  division_id     uuid not null references public.tournament_divisions(id) on delete cascade,
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  seed            int,
  sort_order      int not null default 0
);
-- one pool per entry (regeneration deletes then reinserts)
create unique index if not exists uniq_group_entry_reg on public.tournament_group_entries(registration_id);
create index if not exists idx_group_entries_group on public.tournament_group_entries(group_id);

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  division_id   uuid not null references public.tournament_divisions(id) on delete cascade,
  group_id      uuid references public.tournament_groups(id) on delete cascade,   -- set for pool matches
  bracket       text not null default 'main',                                      -- 'main' | future 'consolation'
  round         int  not null default 0,                                           -- bracket round (0 = pool)
  slot          int  not null default 0,                                           -- position within the round
  entry_a       uuid references public.tournament_registrations(id) on delete set null,
  entry_b       uuid references public.tournament_registrations(id) on delete set null,
  score_a       int,
  score_b       int,
  winner_id     uuid references public.tournament_registrations(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'scheduled', 'completed')),
  scheduled_at  timestamptz,
  court         text,
  next_match_id uuid references public.tournament_matches(id) on delete set null,  -- bracket advancement
  next_slot     text check (next_slot in ('a', 'b')),                              -- which slot the winner fills
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_matches_division on public.tournament_matches(division_id);
create index if not exists idx_matches_group on public.tournament_matches(group_id);

alter table public.tournament_groups        enable row level security;
alter table public.tournament_group_entries enable row level security;
alter table public.tournament_matches       enable row level security;

-- groups: staff read+write, public read when visible
drop policy if exists "groups select" on public.tournament_groups;
create policy "groups select" on public.tournament_groups
  for select to authenticated using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));
drop policy if exists "groups insert" on public.tournament_groups;
create policy "groups insert" on public.tournament_groups
  for insert to authenticated with check (is_tournament_staff(tournament_id));
drop policy if exists "groups update" on public.tournament_groups;
create policy "groups update" on public.tournament_groups
  for update to authenticated using (is_tournament_staff(tournament_id)) with check (is_tournament_staff(tournament_id));
drop policy if exists "groups delete" on public.tournament_groups;
create policy "groups delete" on public.tournament_groups
  for delete to authenticated using (is_tournament_staff(tournament_id));

-- group entries
drop policy if exists "group_entries select" on public.tournament_group_entries;
create policy "group_entries select" on public.tournament_group_entries
  for select to authenticated using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));
drop policy if exists "group_entries insert" on public.tournament_group_entries;
create policy "group_entries insert" on public.tournament_group_entries
  for insert to authenticated with check (is_tournament_staff(tournament_id));
drop policy if exists "group_entries update" on public.tournament_group_entries;
create policy "group_entries update" on public.tournament_group_entries
  for update to authenticated using (is_tournament_staff(tournament_id)) with check (is_tournament_staff(tournament_id));
drop policy if exists "group_entries delete" on public.tournament_group_entries;
create policy "group_entries delete" on public.tournament_group_entries
  for delete to authenticated using (is_tournament_staff(tournament_id));

-- matches
drop policy if exists "matches select" on public.tournament_matches;
create policy "matches select" on public.tournament_matches
  for select to authenticated using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));
drop policy if exists "matches insert" on public.tournament_matches;
create policy "matches insert" on public.tournament_matches
  for insert to authenticated with check (is_tournament_staff(tournament_id));
drop policy if exists "matches update" on public.tournament_matches;
create policy "matches update" on public.tournament_matches
  for update to authenticated using (is_tournament_staff(tournament_id)) with check (is_tournament_staff(tournament_id));
drop policy if exists "matches delete" on public.tournament_matches;
create policy "matches delete" on public.tournament_matches
  for delete to authenticated using (is_tournament_staff(tournament_id));
