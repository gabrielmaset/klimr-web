-- 0168_court_sport_intel.sql — persistent per-venue verification intel.
-- The AI judge screens every search; when it's UNSURE about a venue, a
-- post-response verifier fetches the venue's own website, has the AI READ
-- the facilities list, and records a verdict here with a reliability score.
-- Searches load this intel and treat it as decisive — verify once per
-- venue+sport, benefit forever. Factors behind reliability today: verdict
-- source (venue website > Google type > name > model knowledge) and the
-- extractor's confidence; Klimr first-party signals (check-ins, matches
-- played, directory confirmation) are the planned strongest tier.

create table if not exists public.court_sport_intel (
  place_id    text not null,
  sport       text not null,
  verdict     text not null check (verdict in ('confirmed', 'denied', 'unknown')),
  confidence  numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  reliability numeric not null default 0 check (reliability >= 0 and reliability <= 1),
  evidence    text,
  source      text,
  checked_at  timestamptz not null default now(),
  primary key (place_id, sport)
);

create index if not exists court_sport_intel_sport_checked_idx
  on public.court_sport_intel (sport, checked_at desc);

-- Server-only (service role): RLS on, no public policies.
alter table public.court_sport_intel enable row level security;
