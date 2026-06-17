-- 0019_marketplace_upgrade.sql — adds a sortable numeric price and a save/watchlist.
-- Idempotent. price_text stays the display value; price_cents drives sorting.

alter table public.marketplace_listings add column if not exists price_cents int;

-- Backfill seeded listings' numeric price (coaching = hourly rate).
update public.marketplace_listings set price_cents = 7000  where id = '00000000-0000-0000-0000-00000000f0a1' and price_cents is null;
update public.marketplace_listings set price_cents = 4500  where id = '00000000-0000-0000-0000-00000000f0a2' and price_cents is null;
update public.marketplace_listings set price_cents = 6000  where id = '00000000-0000-0000-0000-00000000f0a3' and price_cents is null;
update public.marketplace_listings set price_cents = 12000 where id = '00000000-0000-0000-0000-00000000f0b1' and price_cents is null;
update public.marketplace_listings set price_cents = 6000  where id = '00000000-0000-0000-0000-00000000f0b2' and price_cents is null;
update public.marketplace_listings set price_cents = 4000  where id = '00000000-0000-0000-0000-00000000f0b3' and price_cents is null;
update public.marketplace_listings set price_cents = 8000  where id = '00000000-0000-0000-0000-00000000f0b4' and price_cents is null;

create table if not exists public.saved_listings (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index if not exists saved_listings_user_idx on public.saved_listings (user_id, created_at desc);
alter table public.saved_listings enable row level security;

drop policy if exists "saved read own" on public.saved_listings;
create policy "saved read own" on public.saved_listings
  for select using (user_id = auth.uid());

drop policy if exists "saved insert own" on public.saved_listings;
create policy "saved insert own" on public.saved_listings
  for insert with check (user_id = auth.uid());

drop policy if exists "saved delete own" on public.saved_listings;
create policy "saved delete own" on public.saved_listings
  for delete using (user_id = auth.uid());
