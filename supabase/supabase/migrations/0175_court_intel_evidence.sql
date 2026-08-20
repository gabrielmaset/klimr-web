-- 0175_court_intel_evidence.sql — richer, safer court verification evidence (audit COURT-005/007).
--
-- Adds to court_sport_intel:
--   source_url       — the exact page the extractor READ to reach its verdict
--                      (today only a free-text `source` note is kept), so the
--                      "Verified · see source" UI can deep-link the evidence.
--   evidence_excerpt — a longer quoted snippet than the terse `evidence` blurb.
--   verifying_at     — an attempt-stamp: set when a verification pass starts,
--                      cleared when it finishes. A second concurrent search for
--                      the same venue sees a recent stamp and SKIPS re-fetching,
--                      ending duplicate concurrent verifications of one place.
--
-- Not risky: additive columns, all nullable, no rewrite of existing rows and
-- no behavioral trigger. No backup required. Safe to run before or after a
-- deploy — the app tolerates the columns being absent (the reads are guarded)
-- and simply gains the richer evidence + concurrency guard once present.

alter table public.court_sport_intel
  add column if not exists source_url        text,
  add column if not exists evidence_excerpt  text,
  add column if not exists verifying_at      timestamptz;

-- Partial index: the concurrency guard only ever queries rows mid-verification.
create index if not exists court_sport_intel_verifying_idx
  on public.court_sport_intel (verifying_at)
  where verifying_at is not null;
