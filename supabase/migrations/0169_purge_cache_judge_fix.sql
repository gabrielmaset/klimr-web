-- 0169_purge_cache_judge_fix.sql — one-time ops purge.
-- The screening judge was being killed by its own 12-second timeout (Sonnet
-- writing 20+ verdicts needs longer), and the fallback then cached "no
-- courts" for 30 minutes. Fixed in code: the judge gets a 20s budget with a
-- one-shot Haiku retry, and a judge outage now returns an HONEST error that
-- is never cached. Purge any emptiness the old behavior wrote so the next
-- search runs clean. Idempotent.

delete from public.court_search_cache;
