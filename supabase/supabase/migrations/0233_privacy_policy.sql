-- 0233_privacy_policy.sql — KCDX-032: the relationship and privacy policy
-- matrix, as specified by the owner (Aug 2026).
--
-- The audit's finding was not that Klimr enforces relationships badly — blocks
-- are symmetric across posts, feed, notifications and search, and
-- discoverability is its own check. It was that there was no WRITTEN policy, so
-- each surface encoded its author's assumption. This is that policy.
--
-- ── ONE LADDER, NOT FIFTEEN TOGGLES ──────────────────────────────────────
-- The owner's answers gave a value per (action × relationship) — fifteen
-- member-configurable cells. Built literally that is fifteen switches in
-- Settings, which nobody reads: people leave the defaults forever, or turn one
-- off and cannot find it again.
--
-- But every answer had the same SHAPE. "Message me" was no / yes / yes / yes
-- across stranger → connection: not three independent choices, one threshold.
-- All five collapse onto a single ordered ladder:
--
--     everyone  ⊃  network  ⊃  following  ⊃  connections
--
--   everyone      any signed-in member (Klimr is invite-only, so already vetted)
--   network       anyone who follows me, anyone I follow, or a connection
--   following     only people I chose — those I follow, plus connections
--   connections   mutual connections only
--
-- `following` sits below `network` because it excludes people who followed me
-- without my choosing them, which is exactly the distinction the owner drew for
-- tagging: a follower may not tag me, someone I follow may.
--
-- Five dropdowns, identical expressiveness, a settings page a person can read.
--
-- ── DEFAULTS, FROM THE COMPLETED MATRIX ──────────────────────────────────
--   connection requests   everyone      comments      everyone
--   match/team invites    everyone      direct messages  network
--   tagging               following
--
-- ── WHAT IS NOT A SETTING ────────────────────────────────────────────────
-- The owner answered these with no member choice, so they are fixed rules:
--   profile page, search, public posts, following me  → everyone (not blocked)
--   connections list, upcoming matches                → connections only
-- The last two are the ones most often regretted elsewhere: a visible
-- connections list lets someone map who plays with whom after a block, and
-- upcoming matches is a member's location at a known future time.

-- ── 1. the settings ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'audience_level') then
    create type public.audience_level as enum ('everyone', 'network', 'following', 'connections');
  end if;
end $$;

alter table public.profiles
  add column if not exists who_can_request  public.audience_level not null default 'everyone',
  add column if not exists who_can_invite   public.audience_level not null default 'everyone',
  add column if not exists who_can_comment  public.audience_level not null default 'everyone',
  add column if not exists who_can_message  public.audience_level not null default 'network',
  add column if not exists who_can_tag      public.audience_level not null default 'following',
  -- A public nickname, alongside the display name. The LEGAL name
  -- (`first_name`/`last_name`) stays private and is not in `profiles_public`:
  -- it is captured for verification and has no business on a member surface.
  add column if not exists nickname text;

comment on column public.profiles.nickname is
  'Optional public nickname shown alongside display_name. The legal name in first_name/last_name is '
  'never public — it exists for verification only.';

-- ── 2. one predicate every surface consults ──────────────────────────────
-- The same lesson as `is_blocked_pair` and `is_discoverable_player`: a rule that
-- each caller reimplements is a rule that drifts. `may_act_on` answers "may this
-- member do this to that member" once.
create or replace function public.may_act_on(
  p_actor   uuid,
  p_subject uuid,
  p_action  text        -- 'request' | 'invite' | 'comment' | 'message' | 'tag'
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with lvl as (
    select case p_action
             when 'request' then p.who_can_request
             when 'invite'  then p.who_can_invite
             when 'comment' then p.who_can_comment
             when 'message' then p.who_can_message
             when 'tag'     then p.who_can_tag
           end as need
      from public.profiles p
     where p.id = p_subject
  ),
  rel as (
    select
      exists (select 1 from public.friendships f
               where f.status = 'accepted'
                 and least(f.requester_id, f.addressee_id) = least(p_actor, p_subject)
                 and greatest(f.requester_id, f.addressee_id) = greatest(p_actor, p_subject)
             ) as connected,
      -- the SUBJECT follows the actor  ⇒ the actor is someone the subject chose
      exists (select 1 from public.follows fo
               where fo.follower_id = p_subject and fo.followee_id = p_actor) as subject_follows_actor,
      -- the ACTOR follows the subject ⇒ a follower the subject did not choose
      exists (select 1 from public.follows fo
               where fo.follower_id = p_actor and fo.followee_id = p_subject) as actor_follows_subject
  )
  select
    p_actor is not null and p_subject is not null
    and p_actor <> p_subject
    -- A block outranks every setting, in both directions.
    and not public.is_blocked_pair(p_actor, p_subject)
    and case (select need from lvl)
          when 'everyone'    then true
          when 'network'     then (select connected or subject_follows_actor or actor_follows_subject from rel)
          when 'following'   then (select connected or subject_follows_actor from rel)
          when 'connections' then (select connected from rel)
          else true
        end;
$$;

grant execute on function public.may_act_on(uuid, uuid, text) to authenticated, service_role;

comment on function public.may_act_on is
  'KCDX-032: may the actor do this to the subject? One ladder — everyone ⊃ network ⊃ following ⊃ '
  'connections — with a block outranking every setting in both directions. Every surface calls this so '
  'the policy cannot drift into five different answers again.';

-- ── 3. the two fixed rules that were not settings ────────────────────────
create or replace function public.may_see_connections(p_viewer uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer = p_subject or (
    not public.is_blocked_pair(p_viewer, p_subject)
    and exists (select 1 from public.friendships f
                 where f.status = 'accepted'
                   and least(f.requester_id, f.addressee_id) = least(p_viewer, p_subject)
                   and greatest(f.requester_id, f.addressee_id) = greatest(p_viewer, p_subject))
  );
$$;

-- Upcoming matches is the same rule: it is a member's location at a known future
-- time, which is the strongest reason on this whole sheet to keep it close.
create or replace function public.may_see_schedule(p_viewer uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.may_see_connections(p_viewer, p_subject);
$$;

grant execute on function public.may_see_connections(uuid, uuid) to authenticated, service_role;
grant execute on function public.may_see_schedule(uuid, uuid) to authenticated, service_role;

-- ── 4. nickname joins the public projection; legal name does not ─────────
drop view if exists public.profiles_public;
create view public.profiles_public
with (security_invoker = false) as
select
  p.id, p.display_name, p.nickname,
  p.avatar_hue, p.avatar_path, p.cover_path, p.bio,
  p.city, p.state, p.country, p.primary_sport,
  p.verification_status, p.reliability,
  p.connections_count, p.followers_count, p.following_count,
  p.member_no, p.created_at, p.last_seen_at, p.presence_mode,
  p.open_to_invites, p.show_courts, p.show_teams, p.show_tournaments,
  p.gear, p.profile_gallery, p.usual_times,
  p.play_style, p.preferred_format, p.handedness, p.is_active,
  case
    when p.date_of_birth is not null then greatest(0, extract(year from age(p.date_of_birth))::int)
    when p.birth_year is not null and p.birth_year > 1900
      then greatest(0, extract(year from current_date)::int - p.birth_year)
    else null
  end as age
from public.profiles p;

grant select on public.profiles_public to authenticated;

comment on view public.profiles_public is
  'KCDX-001/026/032: the approved member-facing projection. Publishes derived values (is_active, age) '
  'and never their sources. Carries display_name and the optional public nickname; first_name and '
  'last_name are verification data and are never exposed here.';
