-- 0149_tournament_pin.sql — tournaments get the same pin architecture as
-- events (0146): resolve ONCE, persist, never re-derive per render.
-- Tournaments already store location_lat/lng — but those come from ZIP
-- centroids (approximate) or the Places picker (precise). The new columns
-- record WHICH, so provisional pins (zip/venue) keep retrying the organizer's
-- Maps link daily and upgrade in place, while place/link pins are final.
--   location_pin_source: 'link' (resolved Maps URL) | 'place' (Places picker)
--                        | 'zip' (ZIP centroid) | 'venue' (geocoded text)
--   location_pin_at:     last resolution attempt (24h backoff). Idempotent.

alter table public.tournaments add column if not exists location_pin_source text;
alter table public.tournaments add column if not exists location_pin_at timestamptz;

do $$ begin
  alter table public.tournaments add constraint tournaments_pin_source_check
    check (location_pin_source is null or location_pin_source in ('link','place','zip','venue'));
exception when duplicate_object then null; end $$;

-- Backfill provenance for existing rows: picker rows are 'place' (final),
-- everything else with coordinates is 'zip' (provisional).
update public.tournaments
set location_pin_source = case when location_place_id is not null then 'place' else 'zip' end
where location_lat is not null and location_pin_source is null;
