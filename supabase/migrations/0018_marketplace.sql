-- 0018_marketplace.sql — coaching & gear listings players can browse and then
-- contact the lister directly. No payments are processed on Klimr and listings are
-- text-only (no uploads) for now; curated (service/admin) writes. Idempotent.

create table if not exists public.marketplace_listings (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('coaching','gear')),
  title         text not null,
  sport_key     text references public.sports(key),
  category      text,                 -- gear: racquet/paddle/bag/shoes/balls/accessory · coaching: focus
  price_text    text,                 -- informational only; no payments processed on Klimr
  condition     text,                 -- gear only: new / like_new / good / fair
  location      text,
  description   text,
  contact_email text,
  listed_by     uuid references public.profiles(id) on delete set null,
  status        text not null default 'active' check (status in ('active','closed')),
  created_at    timestamptz not null default now()
);
create index if not exists marketplace_kind_idx on public.marketplace_listings (kind, created_at desc);
alter table public.marketplace_listings enable row level security;

drop policy if exists "listings readable" on public.marketplace_listings;
create policy "listings readable" on public.marketplace_listings
  for select using (auth.role() = 'authenticated');

-- Seed listings (fixed ids => idempotent).
insert into public.marketplace_listings (id, kind, title, sport_key, category, price_text, condition, location, description, contact_email) values
  ('00000000-0000-0000-0000-00000000f0a1', 'coaching', 'Private Tennis Lessons — USPTA Certified', 'tennis', 'All levels', '$70/hr', null, 'Mar Vista',
   'Stroke production, strategy, and match play for beginners through 4.5. Flexible weekday mornings and weekends.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0a2', 'coaching', 'Pickleball Fundamentals Coaching', 'pickleball', 'Beginner / Intermediate', '$45/hr', null, 'Santa Monica',
   'Dinking, third-shot drops, and kitchen positioning. Group rates available for 2–4 players.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0a3', 'coaching', 'Padel Technique Sessions', 'padel', 'All levels', '$60/hr', null, 'Culver City',
   'Learn the walls, the bandeja, and smart court positioning from a former club pro.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b1', 'gear', 'Babolat Pure Drive 2024', 'tennis', 'racquet', '$120', 'like_new', 'Venice',
   'Grip 3 (4 3/8), strung with Babolat RPM Blast. Barely used, no scratches. Comes with cover.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b2', 'gear', 'Selkirk Amped Pickleball Paddle', 'pickleball', 'paddle', '$60', 'good', 'Mar Vista',
   'Midweight, great control. Some cosmetic wear on the edge guard but plays perfectly.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b3', 'gear', 'Wilson 6-Racquet Tennis Bag', 'tennis', 'bag', '$40', 'good', 'West LA',
   'Thermal main compartment, separate shoe pocket. Plenty of life left.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b4', 'gear', 'Head Padel Racquet (Diadema shape)', 'padel', 'racquet', '$80', 'like_new', 'Culver City',
   'Carbon face, soft EVA core. Ideal for control players. Includes wrist strap.', 'hello@klimr.com')
on conflict (id) do nothing;
