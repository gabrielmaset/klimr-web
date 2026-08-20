-- 0165_purge_court_search_cache.sql — one-time ops purge.
-- The court search pipeline was fixed (multi-query per sport including the
-- previously-broken beach volleyball query, gym/rec-center screening, and —
-- critically — empty results are no longer cached). Existing rows may hold
-- poisoned empty envelopes (the "Westwood Recreation Center never shows"
-- bug): purge them all so every zip+sport refetches fresh through the
-- improved pipeline on next search. Cache refills automatically; the monthly
-- live-search cap still governs volume. Idempotent (a purge is a purge).

delete from public.court_search_cache;
