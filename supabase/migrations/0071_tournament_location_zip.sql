-- 0071_tournament_location_zip.sql
-- Persist the event's ZIP alongside the street address. Previously the ZIP was
-- only used at save time to derive approximate coordinates (the ZIP centroid)
-- and then discarded. Storing it lets the public venue map use address + ZIP
-- for a more accurate pin, and lets the Settings ZIP field pre-fill.

alter table public.tournaments
  add column if not exists location_zip text;

-- Keep it a 5-digit US ZIP (or null). The column is new, so every existing row
-- is null and passes; the app already validates this shape before writing.
alter table public.tournaments
  drop constraint if exists tournaments_location_zip_chk;

alter table public.tournaments
  add constraint tournaments_location_zip_chk
  check (location_zip is null or location_zip ~ '^[0-9]{5}$');
