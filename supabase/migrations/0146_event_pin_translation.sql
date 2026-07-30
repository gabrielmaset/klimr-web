-- 0146_event_pin_translation.sql — the definitive event-pin fix + description
-- translation cache.
--
-- PIN: coordinates are now RESOLVED ONCE and PERSISTED, never re-derived per
-- render. The resolution ladder (in lib/maps-url.ts): coordinates in the pasted
-- link → resolved short link (browser-grade UA + HTML-continuation walking,
-- since Google serves servers interstitials where browsers get the 302) → a
-- Maps LINK inside the description → geocoded venue text. Prose addresses are
-- deliberately NOT read (they may describe a different place than the courts).
-- location_pin_at records the
-- last resolution attempt so unresolvable events back off (24h) instead of
-- refetching on every view.
--
-- TRANSLATION: description_en caches the one-time English translation (cleared
-- whenever the description changes) so the "Translate to English" button is
-- instant after the first click and costs one model call per edit, ever.
-- Idempotent.

alter table public.events add column if not exists location_lat double precision;
alter table public.events add column if not exists location_lng double precision;
alter table public.events add column if not exists location_pin_source text;
alter table public.events add column if not exists location_pin_at timestamptz;
alter table public.events add column if not exists description_en text;
alter table public.events add column if not exists description_en_at timestamptz;

do $$ begin
  alter table public.events add constraint events_location_lat_check
    check (location_lat is null or (location_lat >= -90 and location_lat <= 90));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_location_lng_check
    check (location_lng is null or (location_lng >= -180 and location_lng <= 180));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_pin_source_check
    check (location_pin_source is null or location_pin_source in ('link','address','venue','court'));
exception when duplicate_object then null; end $$;
