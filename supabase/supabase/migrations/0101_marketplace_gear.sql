-- 0101_marketplace_gear.sql — Second Serve (gear-only marketplace) data layer:
-- extends marketplace_listings with the full lifecycle model, adds offers /
-- meetups / reports, scopes chat conversations to listings, and creates the
-- listing-photos storage bucket. Idempotent where practical.

-- ── 1) marketplace_listings: lifecycle + gear model ─────────────────────
alter table public.marketplace_listings
  add column if not exists mode text not null default 'sale',
  add column if not exists obo boolean not null default false,
  add column if not exists trade_wants text,
  add column if not exists photos text[] not null default '{}',
  add column if not exists zip text,
  add column if not exists renewed_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists sold_at timestamptz;

do $$ begin
  alter table public.marketplace_listings
    add constraint marketplace_listings_mode_check check (mode in ('sale','trade','free'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.marketplace_listings
    add constraint marketplace_listings_status_check2 check (status in ('draft','active','pending','sold','expired','removed'));
exception when duplicate_object then null; end $$;

-- Backfill existing gear rows honestly: price-less rows read as Free.
update public.marketplace_listings
   set mode = case when price_cents is null and (price_text is null or price_text ilike '%free%') then 'free' else 'sale' end
 where kind = 'gear' and mode = 'sale';

create index if not exists marketplace_listings_browse_idx
  on public.marketplace_listings (kind, status, created_at desc);
create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings (listed_by, status);

-- ── 2) offers (structured — never inside E2E ciphertext) ───────────────
create table if not exists public.listing_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),          -- who made THIS offer/counter
  amount_cents integer,                                            -- null for trade/free proposals
  note text,
  parent_offer_id uuid references public.listing_offers(id),
  status text not null default 'open' check (status in ('open','accepted','declined','withdrawn','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  decided_at timestamptz
);
create index if not exists listing_offers_listing_idx on public.listing_offers (listing_id, created_at desc);
create index if not exists listing_offers_buyer_idx on public.listing_offers (buyer_id, status);
create unique index if not exists listing_offers_one_open
  on public.listing_offers (listing_id, buyer_id) where status = 'open';

-- ── 3) meetups (agreement → public-place plan; courts as safe spots) ───
create table if not exists public.listing_meetups (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  offer_id uuid references public.listing_offers(id) on delete set null,
  proposed_by uuid not null references public.profiles(id),
  buyer_id uuid not null references public.profiles(id),
  court_id uuid references public.courts(id),
  place_text text,
  starts_at timestamptz not null,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists listing_meetups_listing_idx on public.listing_meetups (listing_id, created_at desc);

-- ── 4) reports (flow into the support seam; admin reviews as tickets) ──
create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists listing_reports_open_idx on public.listing_reports (listing_id) where resolved_at is null;

-- ── 5) chat: listing-scoped conversations (one thread per listing+buyer) ─
alter table public.conversations
  add column if not exists listing_id uuid references public.marketplace_listings(id) on delete cascade;
create unique index if not exists conversations_listing_buyer_unique
  on public.conversations (listing_id, created_by) where listing_id is not null;
create index if not exists conversations_listing_idx on public.conversations (listing_id) where listing_id is not null;

-- ── 6) RLS + explicit GRANTs (table privileges evaluate before policies) ─
alter table public.listing_offers  enable row level security;
alter table public.listing_meetups enable row level security;
alter table public.listing_reports enable row level security;

grant select, insert, update on public.listing_offers  to authenticated;
grant select, insert, update on public.listing_meetups to authenticated;
grant select, insert         on public.listing_reports to authenticated;
grant select, insert, update on public.marketplace_listings to authenticated;

do $$ begin
  create policy listing_offers_participants on public.listing_offers
    for select using (
      buyer_id = auth.uid()
      or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.listed_by = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy listing_offers_insert on public.listing_offers
    for insert with check (
      actor_id = auth.uid()
      and (
        buyer_id = auth.uid()
        or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.listed_by = auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy listing_offers_update on public.listing_offers
    for update using (
      buyer_id = auth.uid()
      or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.listed_by = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy listing_meetups_participants on public.listing_meetups
    for select using (
      buyer_id = auth.uid() or proposed_by = auth.uid()
      or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.listed_by = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy listing_meetups_write on public.listing_meetups
    for insert with check (proposed_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy listing_meetups_update on public.listing_meetups
    for update using (
      buyer_id = auth.uid() or proposed_by = auth.uid()
      or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.listed_by = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy listing_reports_insert on public.listing_reports
    for insert with check (reporter_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Listings: browsers read live inventory; owners read/write their own.
do $$ begin
  create policy marketplace_listings_read on public.marketplace_listings
    for select using (
      status in ('active','pending','sold') or listed_by = auth.uid()
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy marketplace_listings_owner_insert on public.marketplace_listings
    for insert with check (listed_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy marketplace_listings_owner_update on public.marketplace_listings
    for update using (listed_by = auth.uid());
exception when duplicate_object then null; end $$;

-- ── 7) listing photos bucket (public read; sellers write own folder) ───
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

do $$ begin
  create policy "listing photos public read" on storage.objects
    for select using (bucket_id = 'listing-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "listing photos owner insert" on storage.objects
    for insert with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "listing photos owner update" on storage.objects
    for update using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "listing photos owner delete" on storage.objects
    for delete using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
