-- 0031_courts_grants.sql — the court directory grows only through the server
-- (match creation persists Google-found courts via the service-role client).
-- The cache tables (0029) were explicitly granted to service_role, but the
-- courts table (0015) relied on default grants; make the grant explicit so the
-- "Schedule a match" / court-save path can insert. Also re-affirms the 0030
-- columns in case that migration didn't fully apply. Idempotent.

alter table public.courts add column if not exists google_place_id text;
alter table public.courts add column if not exists rating double precision;
alter table public.courts add column if not exists rating_count int;
alter table public.courts add column if not exists is_private boolean not null default false;
create unique index if not exists courts_google_place_id_key on public.courts (google_place_id);

grant all on public.courts to service_role;
grant all on public.court_reviews to service_role;
