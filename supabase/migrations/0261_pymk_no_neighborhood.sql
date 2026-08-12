-- 0261_pymk_no_neighborhood.sql — a suggestion card shows no more about a
-- stranger than their own profile does.
--
-- KRA-027 (P1, re-audit 2026-08-10). `people_you_may_know()` returns
-- `neighborhood`, and `components/pymk-rail.tsx` renders it in preference to
-- `city`: `location={p.neighborhood ?? p.city ?? null}`.
--
-- The people in that rail are by definition people the viewer is NOT connected
-- to — that is what makes them suggestions. So the surface that shows the most
-- about a stranger is the one aimed exclusively at strangers.
--
-- `profiles_public` (0233, tightened by 0236) publishes `city` and `state` and
-- deliberately not `neighborhood`. That decision is the reference point: whatever
-- a member has agreed to show the world is available here, and nothing beyond it.
-- A neighbourhood is a smaller circle than a city — it is the difference between
-- "somewhere in Los Angeles" and a few streets — and it is exactly the resolution
-- OD-7 kept out of the nearby feed for the same reason.
--
-- The column is REMOVED from the return type rather than left and ignored by the
-- card. A value that is returned is a value some future caller renders: the
-- audit's own finding is that a returned-but-unused field became a rendered one.

drop function if exists public.people_you_may_know(int);

create or replace function public.people_you_may_know(p_limit int default 24)
returns table (
  user_id uuid,
  display_name text,
  avatar_hue int,
  avatar_path text,
  verification_status public.verification_status,
  city text,
  primary_sport text,
  score numeric,
  mutual_count int,
  shared_sports text[],
  played_together int,
  shared_team boolean,
  same_area text
) language sql stable security definer set search_path = public as $$
with me as (
  select p.id, p.home_zip, p.city from public.profiles p where p.id = auth.uid()
),
candidates as (
  select distinct f2.friend_id as cand
    from (
      select case when f.requester_id = (select id from me) then f.addressee_id else f.requester_id end as friend_id
        from public.friendships f
       where f.status = 'accepted'
         and ((select id from me) in (f.requester_id, f.addressee_id))
    ) f1
    join lateral (
      select case when f.requester_id = f1.friend_id then f.addressee_id else f.requester_id end as friend_id
        from public.friendships f
       where f.status = 'accepted'
         and f1.friend_id in (f.requester_id, f.addressee_id)
    ) f2 on true
   where f2.friend_id <> (select id from me)
)
select
  p.id,
  coalesce(p.nickname, p.display_name),
  p.avatar_hue,
  p.avatar_path,
  p.verification_status,
  p.city,
  p.primary_sport,
  (
    coalesce((select count(*) from public.friendships mf
               where mf.status = 'accepted'
                 and ((mf.requester_id = p.id and mf.addressee_id in (select cand from candidates))
                   or (mf.addressee_id = p.id and mf.requester_id in (select cand from candidates)))), 0) * 1.0
    + case when p.city is not distinct from (select city from me) then 2.0 else 0.0 end
  )::numeric as score,
  coalesce((select count(*)::int from public.friendships mf
             where mf.status = 'accepted'
               and ((mf.requester_id = p.id) or (mf.addressee_id = p.id))), 0),
  coalesce((select array_agg(ps.sport_key) from public.player_sports ps
             where ps.user_id = p.id and ps.active), '{}'::text[]),
  0,
  false,
  -- Coarse, and only where it is already public: the same city, named at the
  -- resolution `profiles_public` publishes.
  case when p.city is not distinct from (select city from me) then p.city else null end
from public.profiles p
where p.id in (select cand from candidates)
  and p.id <> (select id from me)
  and p.account_status = 'active'
  and p.is_active
  -- Blocked pairs are not suggestions, in either direction.
  and not public.is_blocked_pair((select id from me), p.id)
  -- Nor are people who already have a relationship with the viewer.
  and not exists (
    select 1 from public.friendships f
     where f.status in ('accepted','pending')
       and least(f.requester_id, f.addressee_id) = least((select id from me), p.id)
       and greatest(f.requester_id, f.addressee_id) = greatest((select id from me), p.id)
  )
  and not exists (
    select 1 from public.pymk_dismissals d
     where d.user_id = (select id from me) and d.dismissed_id = p.id
  )
  -- KRA-020/OD-2: and only people who would accept a request from this viewer.
  -- A suggestion whose Connect button is refused is worse than no suggestion.
  and public.may_act_on((select id from me), p.id, 'request')
order by score desc, p.id
limit greatest(coalesce(p_limit, 24), 1);
$$;

revoke all on function public.people_you_may_know(int) from public, anon;
grant execute on function public.people_you_may_know(int) to authenticated, service_role;

comment on function public.people_you_may_know is
  'KRA-027: suggestions carry `city` only. `neighborhood` was returned and rendered in preference to '
  'city, on a rail whose entire audience is people the viewer is NOT connected to — so the surface '
  'aimed exclusively at strangers disclosed the most about them. Column removed rather than left '
  'unused, because a returned field is a field some future caller renders.';

create or replace function public.pymk_privacy_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- neighborhood is not in the return type at all
    not exists (
      select 1 from information_schema.parameters
       where specific_schema = 'public'
         and parameter_name = 'neighborhood'
         and specific_name in (
           select specific_name from information_schema.routines
            where routine_schema = 'public' and routine_name = 'people_you_may_know'
         )
    )
    -- and the suggestion respects the ladder, so a Connect button is not offered
    -- to someone who would refuse it
    and (select position('may_act_on' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'people_you_may_know' limit 1);
$$;

revoke all on function public.pymk_privacy_intact() from public, anon, authenticated;
grant execute on function public.pymk_privacy_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 41)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
