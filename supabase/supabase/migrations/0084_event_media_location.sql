-- 0084_event_media_location.sql — a separate square card thumbnail and an optional
--   exact Google Maps link for the venue. The description column (text) now also
--   holds sanitized rich-text HTML. Idempotent.

alter table public.events add column if not exists thumb_path   text;  -- square image used on event cards/lists
alter table public.events add column if not exists location_url text;  -- exact Google Maps link the organizer pastes
