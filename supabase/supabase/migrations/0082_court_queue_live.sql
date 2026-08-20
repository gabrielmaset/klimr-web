-- 0082_court_queue_live.sql — make the queue live, tighten the geofence to 150m,
--   and add two organizer gates: event-only (must have RSVP'd) and approval-required.
--   Run after 0081. Idempotent.

-- 1) geofence: default radius 150m (was 500). No UI raises it, so joins must be
--    within 150m of the point the organizer starts from.
alter table public.court_sessions alter column radius_m set default 150;
update public.court_sessions set radius_m = 150 where status = 'setup' and radius_m <> 150;

-- 2) organizer gates
alter table public.court_sessions add column if not exists event_only boolean not null default false;       -- only players who RSVP'd to the linked event
alter table public.court_sessions add column if not exists require_approval boolean not null default false;  -- organizer approves each join

-- 3) denormalize session_id onto members so realtime can filter member changes by session
alter table public.queue_team_members add column if not exists session_id uuid references public.court_sessions(id) on delete cascade;
update public.queue_team_members m set session_id = t.session_id from public.queue_teams t where m.team_id = t.id and m.session_id is null;
create index if not exists queue_team_members_session_idx on public.queue_team_members (session_id);

-- 4) approval queue: a request to join a court, held until the organizer decides
create table if not exists public.queue_join_requests (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.court_sessions(id) on delete cascade,
  court_id   uuid not null references public.queue_courts(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  guest_name text,
  status     text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (user_id is not null or guest_name is not null)
);
create index if not exists queue_join_requests_session_idx on public.queue_join_requests (session_id, status, created_at);
-- one outstanding request per account per session
create unique index if not exists queue_join_requests_pending_user_uq on public.queue_join_requests (session_id, user_id) where user_id is not null and status = 'pending';

-- 5) RLS: the dynamic tables are venue-public (signage + the public walk-up page),
--    so allow reads to anon as well — this is also what lets realtime deliver to
--    anonymous walk-up devices. Writes still go only through service-role actions.
--    court_sessions stays authenticated-only (it holds the organizer's GPS center).
alter table public.queue_join_requests enable row level security;
drop policy if exists "queue_join_requests readable" on public.queue_join_requests;
create policy "queue_join_requests readable" on public.queue_join_requests for select using (true);

drop policy if exists "queue_courts readable" on public.queue_courts;
create policy "queue_courts readable" on public.queue_courts for select using (true);
drop policy if exists "queue_teams readable" on public.queue_teams;
create policy "queue_teams readable" on public.queue_teams for select using (true);
drop policy if exists "queue_team_members readable" on public.queue_team_members;
create policy "queue_team_members readable" on public.queue_team_members for select using (true);
drop policy if exists "queue_matches readable" on public.queue_matches;
create policy "queue_matches readable" on public.queue_matches for select using (true);

grant select on public.queue_courts, public.queue_teams, public.queue_team_members, public.queue_matches, public.queue_join_requests to anon, authenticated;
grant all on public.queue_join_requests to service_role;

-- 6) realtime: stream the dynamic tables so the tablet, phones, and walk-up page
--    update instantly. REPLICA IDENTITY FULL is required so realtime can filter
--    UPDATE/DELETE events by session_id (a non-primary-key column), not just INSERTs.
alter table public.queue_teams replica identity full;
alter table public.queue_matches replica identity full;
alter table public.queue_team_members replica identity full;
alter table public.queue_courts replica identity full;
alter table public.queue_join_requests replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='queue_teams') then
      alter publication supabase_realtime add table public.queue_teams;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='queue_matches') then
      alter publication supabase_realtime add table public.queue_matches;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='queue_team_members') then
      alter publication supabase_realtime add table public.queue_team_members;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='queue_courts') then
      alter publication supabase_realtime add table public.queue_courts;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='queue_join_requests') then
      alter publication supabase_realtime add table public.queue_join_requests;
    end if;
  end if;
end $$;
