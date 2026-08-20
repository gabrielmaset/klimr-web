-- 0167_purge_cache_radius_keying.sql — one-time ops purge.
-- Court search engine v3: the user's chosen radius is now the search itself —
-- Nearby Search (New) with a HARD locationRestriction circle plus text passes
-- post-filtered to the radius, cached per (zip, radius_km, sport). The old
-- rows were 50-mile envelopes keyed radius_km=80 under different semantics
-- (the source of a 32.6-mi result under a 10-mi header). Purge them; the new
-- engine refills per exact radius on next search. Idempotent.

delete from public.court_search_cache;
