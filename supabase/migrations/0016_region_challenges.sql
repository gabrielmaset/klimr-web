-- 0016_region_challenges.sql — neighborhood-vs-neighborhood (or city-vs-city)
-- competition for a sport. Standings are computed live from profiles + player_sports,
-- so this table only defines the matchup. Idempotent. Curated (service/admin) writes.

create table if not exists public.region_challenges (
  id         uuid primary key default gen_random_uuid(),
  sport_key  text not null references public.sports(key),
  scope      text not null default 'neighborhood' check (scope in ('neighborhood','city')),
  region_a   text not null,
  region_b   text not null,
  status     text not null default 'active' check (status in ('active','ended')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.region_challenges enable row level security;

drop policy if exists "challenges readable" on public.region_challenges;
create policy "challenges readable" on public.region_challenges
  for select using (auth.role() = 'authenticated');

-- Seed showcase challenges (fixed ids => idempotent).
insert into public.region_challenges (id, sport_key, scope, region_a, region_b, ends_at) values
  ('00000000-0000-0000-0000-00000000d0a1', 'tennis',     'neighborhood', 'Mar Vista',    'Santa Monica', now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000000d0a2', 'pickleball', 'neighborhood', 'Mar Vista',    'Venice',       now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000000d0a3', 'tennis',     'neighborhood', 'Santa Monica', 'Westwood',     now() + interval '30 days')
on conflict (id) do nothing;
