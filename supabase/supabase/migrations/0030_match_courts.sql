-- 0030_match_courts.sql — link matches to the court directory and let the
-- directory grow from real Google places selected during match creation.
-- Idempotent. No new user-facing insert policy on courts: the directory only
-- grows via the server (service role), so writes stay screened.

-- Courts discovered via Google get a stable dedupe key + the rating / visibility
-- metadata we already fetch, so a persisted court matches what search shows.
-- NOTE: a plain unique index (not partial) is intentional — Postgres treats NULLs
-- as distinct, so the seeded courts (google_place_id IS NULL) never collide, while
-- real place ids stay unique. A plain index also lets us upsert ON CONFLICT.
alter table public.courts add column if not exists google_place_id text;
alter table public.courts add column if not exists rating double precision;
alter table public.courts add column if not exists rating_count int;
alter table public.courts add column if not exists is_private boolean not null default false;
create unique index if not exists courts_google_place_id_key
  on public.courts (google_place_id);

-- A match can point at a directory court (nullable). location_text stays as the
-- free-text fallback / "court 3" note. Mirrors public.events.
alter table public.matches add column if not exists court_id uuid
  references public.courts(id) on delete set null;
create index if not exists matches_court_idx on public.matches (court_id);
