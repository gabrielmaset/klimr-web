-- 0088_tournament_location_url.sql — optional Google Maps link for a tournament's venue map.
-- When set, the public tournament page's map uses this link; otherwise it falls back to the
-- venue name/address. Idempotent.
alter table tournaments add column if not exists location_url text;
