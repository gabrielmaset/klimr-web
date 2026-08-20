-- 0085_queue_court_close.sql — lets organizers retire a court at end of day (soft close).
-- A closed court stops accepting walk-up joins and disappears from the public page;
-- the organizer can reopen it. Nothing is deleted, so history stays intact.

alter table public.queue_courts add column if not exists closed_at timestamptz;
