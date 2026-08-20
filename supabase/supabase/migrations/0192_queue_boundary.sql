-- 0192_queue_boundary.sql — KCDX-002 / KCDX-007 / KCDX-008 (three P0s, one
-- boundary). Live venue participation is the most physically sensitive data
-- Klimr holds: who is standing on which court, right now, and where that court
-- is. Today it is readable with the public anon key and streamed to anyone who
-- subscribes.
--
-- KCDX-002. Five queue tables each carry a SELECT policy of `true` for role
-- `public`, `anon` holds SELECT, and all five are members of `supabase_realtime`.
-- That is anonymous read AND anonymous live stream of presence. Nothing in the
-- application needs it: every queue read in the codebase already goes through
-- `loadSessionState()` with the service role, and the browser hook that appeared
-- to need Realtime also polls on a 3s interval, so removing the subscription
-- costs at most one poll of latency.
--
-- KCDX-008. `court_sessions` is readable by every authenticated member and holds
-- `display_code` — the operator credential — alongside the geofence centre. A
-- member who opens any queue page receives the credential in the payload.
--
-- KCDX-007. Knowing that code is currently the whole of authorization for the
-- kiosk match commands. `courtside_authorize()` below replaces it with the
-- capability the fleet already has: migration 0180/0184 mint a per-install token
-- against the join code and store its SHA-256. A capability can be scoped to one
-- session, revoked, and expired by silence. A printed code can be none of those.

-- ── 1. court_sessions: default-deny, then the public columns by name ───────
-- Withheld from members: `code` and `display_code` (credentials), `center_lat` /
-- `center_lng` (a venue's precise location), and `organizer_id`. The server
-- projection already computes what a viewer needs from those; it does not need
-- to hand them over.
revoke select on public.court_sessions from anon, authenticated;

grant select (
  id, event_id, tournament_id, court_id,
  title, sport_key, status,
  win_cap, allow_guests, require_location, event_only, require_approval,
  allow_full_teams, team_name_mode, radius_m,
  paused, paused_by, activated_at, created_at, ended_at
) on public.court_sessions to authenticated;

-- ── 2. the five queue tables: no direct client read at all ────────────────
-- These are served exclusively through the snapshot endpoint, which applies the
-- audience projection. A direct read would bypass that projection by definition,
-- so there is no version of it worth keeping.
revoke select on
  public.queue_courts, public.queue_teams, public.queue_team_members,
  public.queue_matches, public.queue_join_requests
from anon, authenticated;

drop policy if exists "queue_courts readable"        on public.queue_courts;
drop policy if exists "queue_teams readable"         on public.queue_teams;
drop policy if exists "queue_team_members readable"  on public.queue_team_members;
drop policy if exists "queue_matches readable"       on public.queue_matches;
drop policy if exists "queue_join_requests readable" on public.queue_join_requests;

-- ── 3. stop streaming presence ────────────────────────────────────────────
-- Realtime evaluates RLS, but the row shape it publishes is the whole row, and
-- these rows are the presence data. The subscription goes.
do $$
declare t text;
begin
  foreach t in array array['queue_courts','queue_teams','queue_team_members',
                           'queue_matches','queue_join_requests']
  loop
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- ── 4. the operator capability ────────────────────────────────────────────
-- True when this install holds a live, unrevoked token bound to THIS session and
-- has been seen recently. Silence expires the capability on its own, which is the
-- property a venue kiosk needs: a display that is unplugged stops being an
-- operator without anyone remembering to revoke it.
create or replace function public.courtside_authorize(
  p_install_id uuid,
  p_token_hash text,
  p_session_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.courtside_devices d
     where d.install_id = p_install_id
       and d.token_hash is not null
       and d.token_hash = p_token_hash
       and d.revoked_at is null
       and d.session_id = p_session_id
       and d.last_seen_at > now() - interval '10 minutes'
  );
$$;

revoke all on function public.courtside_authorize(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.courtside_authorize(uuid, text, uuid) to service_role;

comment on function public.courtside_authorize is
  'KCDX-007: the Courtside operator capability. Scoped to one session, revocable, '
  'and expired by ten minutes of silence. Match commands require this — never a code.';

-- ── 5. keep it closed ─────────────────────────────────────────────────────
create or replace function public.queue_boundary_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no role but service_role may read the queue tables or the session secrets
    not exists (
      select 1 from information_schema.table_privileges
       where table_schema = 'public'
         and table_name in ('queue_courts','queue_teams','queue_team_members',
                            'queue_matches','queue_join_requests')
         and grantee in ('anon','authenticated')
         and privilege_type = 'SELECT'
    )
    and not exists (
      select 1 from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'court_sessions'
         and grantee in ('anon','authenticated')
         and privilege_type = 'SELECT'
         and column_name in ('code','display_code','center_lat','center_lng','organizer_id')
    )
    and not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename in ('queue_courts','queue_teams','queue_team_members',
                           'queue_matches','queue_join_requests')
    );
$$;

revoke all on function public.queue_boundary_intact() from public, anon, authenticated;
grant execute on function public.queue_boundary_intact() to service_role;

-- ── 6. the manifest learns about these ────────────────────────────────────
-- 0190's manifest is the contract between deployed code and database; the three
-- functions this batch relies on belong in it. Re-applying 0190 after this file
-- is unnecessary — the list there already names them, and this comment is the
-- reminder that the two files move together.
