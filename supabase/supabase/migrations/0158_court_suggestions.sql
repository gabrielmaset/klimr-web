-- 0158_court_suggestions.sql — member court suggestions become a structured,
-- admin-verifiable form (Gabriel's spec), replacing the old Google explorer
-- page (automatic ingestion now lives in the coverage scan). PLUS a catalog
-- repair: saveSports validates against the sports TABLE, which was seeded
-- with only the racquet four — Beach Volleyball (and any future sport)
-- could never save. The full lib catalog is seeded here; adding a sport in
-- the future = one row here + one entry in lib/sports.ts. Idempotent.

insert into public.sports (key, name, skill_system) values
  ('tennis', 'Tennis', 'NTRP'),
  ('pickleball', 'Pickleball', 'DUPR'),
  ('padel', 'Padel', 'Level'),
  ('racquetball', 'Racquetball', 'USAR'),
  ('beach_volleyball', 'Beach Volleyball', 'none')
on conflict (key) do update set name = excluded.name;

create table if not exists public.court_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  address text not null,
  phone text,
  website_url text,
  maps_url text,
  notes text,
  sports text[] not null default '{}',
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index if not exists court_suggestions_status_idx on public.court_suggestions (status, created_at desc);
create index if not exists court_suggestions_user_idx on public.court_suggestions (user_id);

alter table public.court_suggestions enable row level security;
drop policy if exists "suggest own" on public.court_suggestions;
create policy "suggest own" on public.court_suggestions
  for insert with check (user_id = auth.uid());
drop policy if exists "read own suggestions" on public.court_suggestions;
create policy "read own suggestions" on public.court_suggestions
  for select using (user_id = auth.uid());

-- Safe if the table pre-dates this column (idempotent either way):
alter table public.court_suggestions add column if not exists sports text[] not null default '{}';

grant insert, select on public.court_suggestions to authenticated;
