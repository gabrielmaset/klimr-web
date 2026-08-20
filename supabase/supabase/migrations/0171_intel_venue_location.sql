-- 0171_intel_venue_location.sql — confirmed venues become results BY RIGHT.
-- The ledger proved the last failure mode: Westwood was intel-confirmed with
-- quoted evidence, yet absent from a pass because Google's text results vary
-- call-to-call and it wasn't re-surfaced as a candidate that time. Fix: the
-- verifier stores the venue's location + basics when it rules, and every
-- search merges in-radius CONFIRMED venues from this table as first-class
-- candidates — inclusion no longer depends on Google's ranking mood.
-- Idempotent.

alter table public.court_sport_intel
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists rating numeric,
  add column if not exists rating_count integer;
