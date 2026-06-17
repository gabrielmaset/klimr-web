-- 0017_events.sql — local events (open play, ladder nights, clinics, tournaments,
-- socials) and RSVPs. Idempotent. Event creation is curated (service/admin); any
-- member can RSVP / cancel their own RSVP.

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  sport_key     text not null references public.sports(key),
  kind          text not null default 'open_play' check (kind in ('open_play','ladder','clinic','tournament','social')),
  description   text,
  court_id      uuid references public.courts(id) on delete set null,
  location_text text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  capacity      int,
  cost_text     text,
  status        text not null default 'active' check (status in ('active','cancelled')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);
alter table public.events enable row level security;

drop policy if exists "events readable" on public.events;
create policy "events readable" on public.events
  for select using (auth.role() = 'authenticated');

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_user_idx on public.event_rsvps (user_id);
alter table public.event_rsvps enable row level security;

drop policy if exists "rsvps readable" on public.event_rsvps;
create policy "rsvps readable" on public.event_rsvps
  for select using (auth.role() = 'authenticated');

drop policy if exists "rsvps insert own" on public.event_rsvps;
create policy "rsvps insert own" on public.event_rsvps
  for insert with check (user_id = auth.uid());

drop policy if exists "rsvps delete own" on public.event_rsvps;
create policy "rsvps delete own" on public.event_rsvps
  for delete using (user_id = auth.uid());

-- Seed upcoming events at seeded courts (relative dates => always upcoming on run).
insert into public.events (id, title, sport_key, kind, description, court_id, starts_at, ends_at, capacity, cost_text) values
  ('00000000-0000-0000-0000-00000000e0a1', 'Saturday Pickleball Open Play', 'pickleball', 'open_play',
   'Drop-in rotating doubles for all levels. Paddles to share if you''re new.',
   '00000000-0000-0000-0000-00000000c0a1', now() + interval '3 days' + interval '9 hours', now() + interval '3 days' + interval '12 hours', 16, 'Free'),
  ('00000000-0000-0000-0000-00000000e0a2', 'Tuesday Tennis Ladder Night', 'tennis', 'ladder',
   'Weekly ladder matches. Win to climb. Bring a can of balls.',
   '00000000-0000-0000-0000-00000000c0a2', now() + interval '5 days' + interval '18 hours', now() + interval '5 days' + interval '21 hours', 24, 'Free'),
  ('00000000-0000-0000-0000-00000000e0a3', 'Beginner Padel Clinic', 'padel', 'clinic',
   'Intro clinic covering serves, the glass, and positioning. Loaner racquets provided.',
   '00000000-0000-0000-0000-00000000c0a5', now() + interval '7 days' + interval '10 hours', now() + interval '7 days' + interval '11 hours' + interval '30 minutes', 8, '$15 drop-in'),
  ('00000000-0000-0000-0000-00000000e0a4', 'Westside Tennis Round-Robin', 'tennis', 'tournament',
   'Friendly round-robin, prizes for the top two. Singles, intermediate and up.',
   '00000000-0000-0000-0000-00000000c0a4', now() + interval '10 days' + interval '9 hours', now() + interval '10 days' + interval '13 hours', 16, 'Free')
on conflict (id) do nothing;
