-- 0170_intel_display_name.sql — canonical venue names ride with verdicts.
-- The web-search verifier learns each venue's proper name while researching
-- it ("Westwood Recreation Center pool" → "Westwood Recreation Center").
-- Intel-confirmed venues skip the live judge (the speed short-circuit), so
-- the cleaned name must persist here or the raw sub-amenity name leaks onto
-- the page. Idempotent.

alter table public.court_sport_intel
  add column if not exists display_name text;
