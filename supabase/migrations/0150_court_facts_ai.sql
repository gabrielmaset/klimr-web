-- 0150_court_facts_ai.sql — AI-evaluated court facts (Gabriel's call).
-- The hide-when-null rule bans FAKING; it does not ban INFERENCE from real
-- evidence. When lights/free/indoor/court_count are unknown, an evaluator
-- reads the court's Google Place evidence (reviews, editorial summary,
-- opening hours) and fills ONLY null fields, conservatively (per-field
-- confidence threshold; null when evidence is weak).
--   facts_inference   — the full verdict: values, confidence, evidence quotes
--   facts_inferred    — which columns currently hold AI-inferred values
--                       (cleared per-field when a human confirms)
--   facts_inferred_at — last evaluation attempt (7-day backoff on failure)
-- AI never overwrites a non-null value; humans always can. Idempotent.

alter table public.courts add column if not exists facts_inference jsonb;
alter table public.courts add column if not exists facts_inferred text[] not null default '{}';
alter table public.courts add column if not exists facts_inferred_at timestamptz;
