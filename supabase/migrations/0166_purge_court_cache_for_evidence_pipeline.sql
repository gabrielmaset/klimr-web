-- 0166_purge_court_cache_for_evidence_pipeline.sql — one-time ops purge.
-- The court screening was rebuilt as an EVIDENCE pipeline: a venue ships only
-- with concrete proof of the sport (its own name, or its own website —
-- fetched and checked), judged by the AI with the evidence in hand; a
-- plausible-looking rec center with no proof is dropped. Cached envelopes
-- from the previous screen may contain unproven venues (the "Mar Vista shows
-- for racquetball" bug) — purge so every zip+sport refetches through the
-- evidence pipeline on next search. Idempotent.

delete from public.court_search_cache;
