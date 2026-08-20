-- 0241_one_invite_control.sql — collapses two invite settings into one, using the
-- `nobody` level that 0240 committed.
--
-- RUN AFTER 0240 HAS COMMITTED. It uses an enum value 0240 adds, and PostgreSQL
-- refuses that in a single transaction.
--
-- Before this migration Klimr had two controls that overlapped:
--   · `user_preferences.who_can_invite` — 'anyone' | 'nobody' (0144), mirrored by
--     trigger to the indexed boolean `profiles.open_to_invites`;
--   · `profiles.who_can_invite` — the audience_level ladder (0233).
-- 0238 enforced BOTH, boolean as the stricter override, so nothing was reachable
-- that should not have been. But two settings meaning overlapping things is the
-- condition KCDX-032 exists to end: each surface picks one, and they drift.
--
-- After this migration there is ONE authoritative control — the ladder — and two
-- derived conveniences that are maintained, never authored:
--   · `profiles.open_to_invites` becomes a MIRROR of (who_can_invite <> 'nobody'),
--     kept because two live surfaces filter on it with an index
--     (`app/team/[teamId]/roster/page.tsx`, `app/profile/[id]/page.tsx`);
--   · the settings toggle keeps writing `user_preferences`, and its trigger now
--     writes the LADDER rather than the boolean.

-- ── 1. the ladder learns to say "nobody" ─────────────────────────────────
-- `may_act_on` is recreated with the new arm. Also closes a fail-open in the
-- original: the trailing `else true` fired when the subject had no profiles row,
-- so an absent subject meant ALLOW. Every column here is NOT NULL with a default,
-- so the only way to reach `else` is a subject who does not exist — and
-- "indeterminate never becomes allow" is the acceptance criterion of KRA-015 in
-- this same audit. It denies now.
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
      exists (select 1 from public.follows fo
               where fo.follower_id = p_subject and fo.followee_id = p_actor) as subject_follows_actor,
      exists (select 1 from public.follows fo
               where fo.follower_id = p_actor and fo.followee_id = p_subject) as actor_follows_subject
  )
  select
    p_actor is not null and p_subject is not null
    and p_actor <> p_subject
    and not public.is_blocked_pair(p_actor, p_subject)
    and case (select need from lvl)
          when 'everyone'    then true
          when 'network'     then (select connected or subject_follows_actor or actor_follows_subject from rel)
          when 'following'   then (select connected or subject_follows_actor from rel)
          when 'connections' then (select connected from rel)
          when 'nobody'      then false
          else false          -- absent subject / unknown level ⇒ deny
        end;
$$;

comment on function public.may_act_on is
  'KCDX-032 + KRA-008: may the actor do this to the subject? One ladder — everyone ⊃ network ⊃ '
  'following ⊃ connections ⊃ nobody — with a block outranking every setting in both directions. '
  'Fails CLOSED on an unknown level or an absent subject.';

-- ── 2. carry the boolean's meaning into the ladder ───────────────────────
-- Anyone who had said "nobody" keeps saying it, now in the one place that counts.
update public.profiles
   set who_can_invite = 'nobody'
 where open_to_invites = false
   and who_can_invite <> 'nobody';

-- ── 3. the boolean becomes derived, not authored ─────────────────────────
create or replace function public.sync_open_to_invites_mirror()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.open_to_invites := (new.who_can_invite <> 'nobody');
  return new;
end $$;

drop trigger if exists profiles_mirror_open_to_invites on public.profiles;
create trigger profiles_mirror_open_to_invites
  before insert or update of who_can_invite on public.profiles
  for each row execute function public.sync_open_to_invites_mirror();

-- Reconcile any row the update above did not touch, so the mirror is true from
-- the moment this migration commits rather than from each row's next write.
update public.profiles
   set open_to_invites = (who_can_invite <> 'nobody')
 where open_to_invites is distinct from (who_can_invite <> 'nobody');

comment on column public.profiles.open_to_invites is
  'DERIVED MIRROR of (who_can_invite <> ''nobody''), maintained by trigger. Do not write it directly '
  '— it exists because two surfaces filter on it with an index. The ladder is the control.';

-- ── 4. the settings toggle writes the ladder ─────────────────────────────
-- The UI still writes user_preferences.who_can_invite ('anyone' | 'nobody');
-- 0144's trigger used to mirror that to the boolean. It now sets the ladder.
-- 'anyone' deliberately does NOT clobber a member who chose 'connections' or
-- 'following' — it only lifts them out of 'nobody', because the toggle's two
-- positions cannot express the level they picked.
create or replace function public.sync_open_to_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.who_can_invite, 'anyone') = 'nobody' then
    update public.profiles set who_can_invite = 'nobody'
     where id = new.user_id and who_can_invite <> 'nobody';
  else
    update public.profiles set who_can_invite = 'everyone'
     where id = new.user_id and who_can_invite = 'nobody';
  end if;
  return new;
end $$;

-- ── 5. the invite trigger consults ONE thing ─────────────────────────────
-- 0238 had to check the boolean AND the ladder because the ladder could not
-- express "nobody". It can now, so the boolean check goes — leaving one predicate,
-- which is the whole point of the exercise.
create or replace function public.enforce_invite_privacy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.may_act_on(new.invited_by, new.invited_user_id, 'invite') then
    raise exception 'not open to invites';
  end if;
  return new;
end $$;

-- ── 6. boundary sentinel ─────────────────────────────────────────────────
create or replace function public.one_invite_control_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the ladder can express "nobody"
    exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'audience_level' and e.enumlabel = 'nobody')
    -- the mirror agrees with the control for every row
    and not exists (
      select 1 from public.profiles
       where open_to_invites is distinct from (who_can_invite <> 'nobody')
    )
    -- the mirror is maintained, so it cannot drift on the next write
    and exists (select 1 from pg_trigger where tgname = 'profiles_mirror_open_to_invites')
    -- and the invite gate consults the ladder, not the boolean.
    --
    -- Positive assertion first: it must CALL the predicate. The negative half uses
    -- `position(...)` rather than LIKE because `_` is a single-character WILDCARD
    -- in LIKE — my first draft wrote `not like '%open_to_invites%'`, which matched
    -- the function's own exception text 'not open to invites' and reported the
    -- gate dirty when it was clean. A guardrail that asserts on prose finds prose.
    and (select position('may_act_on' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'enforce_invite_privacy' limit 1)
    and (select position('open_to_invites' in pg_get_functiondef(p.oid)) = 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'enforce_invite_privacy' limit 1);
$$;

revoke all on function public.one_invite_control_intact() from anon, authenticated, public;
grant execute on function public.one_invite_control_intact() to service_role;

-- ── 7. readiness floor moves with the new sentinel ───────────────────────
create or replace function public.klimr_ready(p_min_checks integer default 22)
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
