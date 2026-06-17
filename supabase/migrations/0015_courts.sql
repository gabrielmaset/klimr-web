-- 0015_courts.sql — court/venue directory and community reviews. Idempotent.
-- Court info is readable by signed-in users; reviews are written by members and
-- screened by the app before insert. Seeds a few Westside LA courts.

create table if not exists public.courts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sports       text[] not null default '{}',
  address      text,
  neighborhood text,
  city         text,
  state        text,
  zip          text,
  lat          double precision,
  lng          double precision,
  amenities    text[] not null default '{}',
  created_at   timestamptz not null default now()
);
alter table public.courts enable row level security;

drop policy if exists "courts readable" on public.courts;
create policy "courts readable" on public.courts
  for select using (auth.role() = 'authenticated');

create table if not exists public.court_reviews (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text,
  created_at timestamptz not null default now(),
  unique (court_id, author_id)
);
create index if not exists court_reviews_court_idx on public.court_reviews (court_id, created_at desc);
alter table public.court_reviews enable row level security;

drop policy if exists "reviews readable" on public.court_reviews;
create policy "reviews readable" on public.court_reviews
  for select using (auth.role() = 'authenticated');

drop policy if exists "reviews insert own" on public.court_reviews;
create policy "reviews insert own" on public.court_reviews
  for insert with check (author_id = auth.uid());

drop policy if exists "reviews update own" on public.court_reviews;
create policy "reviews update own" on public.court_reviews
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "reviews delete own" on public.court_reviews;
create policy "reviews delete own" on public.court_reviews
  for delete using (author_id = auth.uid());

-- Seed Westside courts (approximate coordinates; fixed ids => idempotent).
insert into public.courts (id, name, sports, address, neighborhood, city, state, zip, lat, lng, amenities) values
  ('00000000-0000-0000-0000-00000000c0a1', 'Mar Vista Recreation Center', array['tennis','pickleball'], '11430 Woodbine St', 'Mar Vista', 'Los Angeles', 'CA', '90066', 34.0119, -118.4309, array['Lighted courts','Restrooms','Free parking','Water fountain']),
  ('00000000-0000-0000-0000-00000000c0a2', 'Stoner Recreation Center', array['tennis','pickleball','racquetball'], '1835 Stoner Ave', 'West LA', 'Los Angeles', 'CA', '90025', 34.0386, -118.4490, array['Lighted courts','Restrooms','Pro shop nearby']),
  ('00000000-0000-0000-0000-00000000c0a3', 'Penmar Recreation Center', array['tennis'], '1341 Lake St', 'Venice', 'Los Angeles', 'CA', '90291', 33.9967, -118.4561, array['Lighted courts','Backboard','Free parking']),
  ('00000000-0000-0000-0000-00000000c0a4', 'Memorial Park', array['tennis'], '1401 Olympic Blvd', 'Santa Monica', 'Santa Monica', 'CA', '90404', 34.0186, -118.4789, array['Lighted courts','Restrooms','Reservations']),
  ('00000000-0000-0000-0000-00000000c0a5', 'Bay Cities Padel Club', array['padel'], 'Hayden Ave', 'Culver City', 'Culver City', 'CA', '90232', 34.0264, -118.3850, array['Indoor courts','Pro shop','Coaching','Reservations']),
  ('00000000-0000-0000-0000-00000000c0a6', 'Westwood Recreation Center', array['tennis','pickleball'], '1350 Sepulveda Blvd', 'Westwood', 'Los Angeles', 'CA', '90025', 34.0489, -118.4399, array['Lighted courts','Restrooms','Free parking'])
on conflict (id) do nothing;
