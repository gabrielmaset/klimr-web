-- 0042_court_checkins.sql — court check-ins power "busy now" status and gate reviews.
-- A review can only come from a verified player who has actually been at the court
-- (checked in here, or played a match linked to this court). Idempotent / safe to re-run.

create table if not exists public.court_checkins (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists court_checkins_court_idx on public.court_checkins (court_id, created_at desc);
create index if not exists court_checkins_user_idx  on public.court_checkins (user_id, court_id);

alter table public.court_checkins enable row level security;

-- Busy status is a shared signal, so any signed-in player can read check-in counts.
drop policy if exists "court_checkins read" on public.court_checkins;
create policy "court_checkins read" on public.court_checkins
  for select using (auth.role() = 'authenticated');

-- You can only check yourself in.
drop policy if exists "court_checkins insert" on public.court_checkins;
create policy "court_checkins insert" on public.court_checkins
  for insert with check (user_id = auth.uid());

-- And remove your own check-in.
drop policy if exists "court_checkins delete" on public.court_checkins;
create policy "court_checkins delete" on public.court_checkins
  for delete using (user_id = auth.uid());

grant all on public.court_checkins to service_role;
