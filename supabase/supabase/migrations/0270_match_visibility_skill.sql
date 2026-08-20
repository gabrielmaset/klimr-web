-- 0270_match_visibility_skill.sql — a match declares who may discover it and
-- what level it is seeking, and the read policy honors it. D-42, database half.
--
-- WHAT EXISTS. Organize-a-match already has open spots (total_slots), a
-- join-request + waitlist system, and a read policy from 0001 that showed
-- every OPEN match to every member with no owner choice in the matter, and
-- hid SCHEDULED matches from everyone but their own people even though the
-- Play browse query asks for both statuses.
--
-- WHAT THIS ADDS. Three columns and a rebuilt read policy:
--   visibility  'public' | 'followers' | 'friends' — the same ladder, with
--               the same relationship semantics, as posts (0140). Default
--               'public' preserves today's behavior for every existing match.
--   skill_min / skill_max — the level band the organizer is seeking, drawn
--               from the ordered player vocabulary (new, casual, competitive,
--               advanced). Null means open to all levels. ADVISORY on
--               purpose: the organizer approves every join request, so the
--               request flow is the enforcement point; these columns exist
--               for discovery and the match card.
--
-- The relationship test lives in a caller-bound SECURITY DEFINER helper
-- (0268 doctrine: policies run with the querying role and must not lean on
-- raw pair predicates). Deliberate behavior change, pinned by the suite:
-- scheduled matches are discoverable under the same ladder as open ones;
-- completed, disputed and void matches stay visible only to their organizer
-- and participants.

alter table public.matches
  add column if not exists visibility text not null default 'public';
alter table public.matches
  add column if not exists skill_min text;
alter table public.matches
  add column if not exists skill_max text;

do $$ begin
  alter table public.matches
    add constraint matches_visibility_check
    check (visibility in ('public','followers','friends'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.matches
    add constraint matches_skill_min_check
    check (skill_min is null or skill_min in ('new','casual','competitive','advanced'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.matches
    add constraint matches_skill_max_check
    check (skill_max is null or skill_max in ('new','casual','competitive','advanced'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.matches
    add constraint matches_skill_order_check
    check (
      skill_min is null or skill_max is null
      or array_position(array['new','casual','competitive','advanced'], skill_min)
      <= array_position(array['new','casual','competitive','advanced'], skill_max)
    );
exception when duplicate_object then null; end $$;

-- Caller-bound visibility test: may the CURRENT viewer discover a match by
-- this organizer at this visibility. Mirrors the posts 0140 semantics
-- exactly: friends and followers both accept an accepted friendship in
-- either direction; followers additionally accepts the viewer following the
-- organizer.
create or replace function public.match_audience_visible(
  p_organizer  uuid,
  p_visibility text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_visibility = 'public'
      or ( p_visibility in ('friends','followers')
           and exists (
             select 1 from public.friendships f
             where f.status = 'accepted'
               and ((f.requester_id = auth.uid() and f.addressee_id = p_organizer)
                 or (f.addressee_id = auth.uid() and f.requester_id = p_organizer))
           ) )
      or ( p_visibility = 'followers'
           and exists (
             select 1 from public.follows fo
             where fo.follower_id = auth.uid() and fo.followee_id = p_organizer
           ) );
$$;

revoke all on function public.match_audience_visible(uuid, text) from public, anon;
grant execute on function public.match_audience_visible(uuid, text) to authenticated, service_role;

comment on function public.match_audience_visible is
  'Caller-bound discovery test for matches: may the CURRENT viewer see a match by this organizer '
  'at this visibility. Same ladder and relationship semantics as the posts audience (0140).';

drop policy if exists "matches visible" on public.matches;
create policy "matches visible" on public.matches
  for select to authenticated using (
    organizer_id = auth.uid()
    or public.is_match_participant(id, auth.uid())
    or ( status in ('open','scheduled')
         and public.match_audience_visible(organizer_id, visibility) )
  );

create index if not exists matches_discovery_idx
  on public.matches (status, visibility, sport_key, scheduled_at);

select public.journal_migration('0270', '0270_match_visibility_skill.sql', null,
  'Match visibility ladder (public, followers, friends) mirrors the posts audience. Skill range columns added as advisory targeting. Read policy honors visibility via caller-bound match_audience_visible and now covers scheduled matches.');
