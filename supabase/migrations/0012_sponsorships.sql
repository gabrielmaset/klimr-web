-- 0012_sponsorships.sql — local businesses sponsoring top-ranked amateur players.
-- Sponsors are public. A player sees their own sponsorships/offers and can accept
-- or decline offers. Offers are created by admins/businesses (service role).
-- Idempotent and safe to re-run.

create table if not exists public.sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  hue        integer not null default 18,
  type       text not null default 'Equipment Partner',
  location   text,
  tagline    text,
  about      text,
  perks      text[] not null default '{}',
  products   jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;

drop policy if exists "sponsors readable" on public.sponsors;
create policy "sponsors readable" on public.sponsors
  for select using (auth.role() = 'authenticated');

create table if not exists public.player_sponsorships (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.profiles(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  status     text not null default 'offered' check (status in ('offered','active','declined','ended')),
  category   text not null default 'Equipment',
  term       text not null default '12-month term · cancel anytime',
  started_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists player_sponsorships_player_idx on public.player_sponsorships (player_id);
alter table public.player_sponsorships enable row level security;

drop policy if exists "sponsorship read own" on public.player_sponsorships;
create policy "sponsorship read own" on public.player_sponsorships
  for select using (player_id = auth.uid());

-- Players accept/decline their own offers; offers themselves are created server-side.
drop policy if exists "sponsorship update own" on public.player_sponsorships;
create policy "sponsorship update own" on public.player_sponsorships
  for update using (player_id = auth.uid()) with check (player_id = auth.uid());

-- Seed a few local sponsors so the directory has content.
insert into public.sponsors (id, name, hue, type, location, tagline, about, perks, products) values
  ('00000000-0000-0000-0000-0000000005b1', 'Mar Vista Pro Shop', 18, 'Equipment Partner', 'Mar Vista · 90066',
   'Local racquet sports specialists since 2019',
   'An independent pro shop serving the Westside racquet community with stringing, demos, and gear.',
   array['Free monthly stringing', '15% off all gear', 'Featured in the shop window'],
   '[{"name":"Racquet stringing","price":"$25"},{"name":"Grip replacement","price":"$8"},{"name":"Weekly demo racquet","price":"$15"}]'::jsonb),
  ('00000000-0000-0000-0000-0000000005b2', 'Westside Tennis Co.', 8, 'Apparel Partner', 'Santa Monica · 90404',
   'Performance apparel for the local game',
   'A Westside apparel label outfitting top-ranked neighborhood players.',
   array['Seasonal apparel kit', '20% off the online store', 'Co-branded match shirt'],
   '[{"name":"Match polo","price":"$48"},{"name":"Performance shorts","price":"$38"}]'::jsonb),
  ('00000000-0000-0000-0000-0000000005b3', 'Bay Cities Padel Club', 45, 'Club Partner', 'Culver City · 90232',
   'Where the Westside plays padel',
   'A premier padel facility offering court time and coaching to sponsored locals.',
   array['4 free court hours / month', 'Priority booking', 'Two guest passes'],
   '[{"name":"Court hour","price":"$40"},{"name":"Group clinic","price":"$30"}]'::jsonb)
on conflict (id) do nothing;
