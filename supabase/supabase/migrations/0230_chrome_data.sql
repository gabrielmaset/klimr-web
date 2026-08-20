-- 0230_chrome_data.sql — KCDX-065 (P2, part): the global shell performs
-- excessive work per view.
--
-- `lib/chrome-data.ts` runs on EVERY page view, for every signed-in member, and
-- issues its reads one after another:
--
--   1  presence_mode              6  upcoming matches (up to 5)
--   2  team_members               7  …then a COUNT per candidate match, in a loop
--   3  teams                      8  …then the court name for the winner
--   4  unread notifications       9  chat_unread_count
--   5  match_participants
--
-- Nine serial round trips plus a loop, to render a header. The loop is the part
-- that scales badly in the wrong direction: it exists to find the first match
-- whose roster is FULL, so the more matches a member has coming up, the more
-- queries their header costs — active members pay the most.
--
-- ── ONE ROUND TRIP ───────────────────────────────────────────────────────
-- All of it is one query now, and the roster-full test that drove the loop is a
-- single grouped join. The application keeps the same shape, so nothing above it
-- changes.
--
-- INVOKER rights, deliberately: every table read here is already readable by the
-- member through RLS, and a SECURITY DEFINER version would be a new privileged
-- path for data that needs none.

create or replace function public.chrome_data()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  presence as (
    select p.presence_mode from public.profiles p, me where p.id = me.uid
  ),
  my_teams as (
    select t.id, t.name, t.sport_key, t.category
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
      join me on tm.user_id = me.uid
     where t.deleted_at is null
     limit 50
  ),
  unread as (
    select count(*)::int as n
      from public.notifications n, me
     where n.user_id = me.uid and n.read_at is null
  ),
  -- The loop, as a join. Candidate matches with their filled count, keeping only
  -- those whose roster is complete, earliest first.
  next_match as (
    select m.id, m.sport_key, m.scheduled_at,
           coalesce(c.name, m.location_text) as place
      from public.matches m
      join public.match_participants mine on mine.match_id = m.id
      join me on mine.user_id = me.uid
      left join public.courts c on c.id = m.court_id
     where m.status in ('open','scheduled')
       and m.scheduled_at >= now()
       and (select count(*) from public.match_participants mp where mp.match_id = m.id) >= m.total_slots
     order by m.scheduled_at
     limit 1
  )
  select jsonb_build_object(
    'presenceMode', (select presence_mode from presence),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'sport_key', sport_key, 'category', category)) from my_teams), '[]'::jsonb),
    'unread', (select n from unread),
    'nextMatch', (select case when id is null then null else jsonb_build_object(
        'id', id, 'sportKey', sport_key, 'scheduledAt', scheduled_at, 'place', place) end from next_match)
  );
$$;

revoke all on function public.chrome_data() from public, anon;
grant execute on function public.chrome_data() to authenticated, service_role;

comment on function public.chrome_data is
  'KCDX-065: everything the global shell needs, in one round trip. Replaces nine serial reads plus a '
  'per-match count loop that ran on every page view — a loop whose cost grew with how many matches a '
  'member had coming up, so the most active members paid the most to render a header.';
