-- 0102_listing_meet_spots.sql — preferred meet spots on a listing:
-- up to three nearby Klimr courts the seller suggests as safe exchange points.
alter table public.marketplace_listings
  add column if not exists meet_court_ids uuid[] not null default '{}';
