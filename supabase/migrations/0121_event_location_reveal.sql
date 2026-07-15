-- 0121_event_location_reveal.sql — the "DM for location" pattern, done right:
-- hosts can share the exact spot only with people who RSVP. 'public' (default)
-- keeps today's behavior; 'rsvp' hides court/address/map/links from everyone
-- except the host, managers, and confirmed attendees — the event page and
-- cards show the neighborhood-level hint instead.

alter table public.events
  add column if not exists location_reveal text not null default 'public'
    check (location_reveal in ('public', 'rsvp'));
