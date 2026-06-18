-- 0029_court_search.sql — backing store for the LIVE court search.
-- The search itself runs server-side (service-role client); these tables are
-- locked to the service role only. Three tables:
--   1) zip_geocode        — ZIP → lat/lng, cached forever (ZIP centroids don't move)
--   2) court_search_cache — (zip, radius, sport) → the AI-filtered result list, with TTL
--   3) service_usage      — per-month counter of LIVE (paid) searches, for the spend cap
-- Idempotent.

-- 1) ZIP → coordinates cache (one geocode per ZIP, reused across radius/sport).
create table if not exists public.zip_geocode (
  zip        text primary key,
  lat        double precision not null,
  lng        double precision not null,
  fetched_at timestamptz not null default now()
);
alter table public.zip_geocode enable row level security;
revoke all on public.zip_geocode from anon, authenticated;
grant all on public.zip_geocode to service_role;

-- 2) Live search result cache. One row per (zip, radius_km, sport); refreshed when
--    older than the TTL the server enforces. `results` is the final AI-filtered list.
create table if not exists public.court_search_cache (
  zip        text not null,
  radius_km  int  not null,
  sport      text not null,
  results    jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (zip, radius_km, sport)
);
alter table public.court_search_cache enable row level security;
revoke all on public.court_search_cache from anon, authenticated;
grant all on public.court_search_cache to service_role;

-- 3) Monthly usage counter. The server increments live_search_count on each
--    uncached (paid) search and refuses new live calls past the configured cap.
create table if not exists public.service_usage (
  month             text primary key,  -- 'YYYY-MM' (UTC)
  live_search_count int  not null default 0,
  updated_at        timestamptz not null default now()
);
alter table public.service_usage enable row level security;
revoke all on public.service_usage from anon, authenticated;
grant all on public.service_usage to service_role;

-- Atomic "claim one live search if under cap": increments and returns true, or
-- returns false when the month is already at/over p_cap. Service-role only.
create or replace function public.claim_live_search(p_month text, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.service_usage (month, live_search_count)
    values (p_month, 0)
    on conflict (month) do nothing;

  update public.service_usage
     set live_search_count = live_search_count + 1,
         updated_at = now()
   where month = p_month
     and live_search_count < p_cap
   returning live_search_count into v_count;

  return v_count is not null;
end;
$$;
revoke all on function public.claim_live_search(text, int) from public, anon, authenticated;
grant execute on function public.claim_live_search(text, int) to service_role;
