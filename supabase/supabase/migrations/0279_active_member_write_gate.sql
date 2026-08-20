-- 0279_active_member_write_gate.sql — H3: suspension becomes a database fact.
-- KFU-028 (P1). The authoritative containment per the auditor's correction:
-- an existing access token stays valid until expiry, so Auth-side revocation
-- alone cannot stop a suspended member. The DATABASE must refuse the write.
--
-- FINDING. Member-write policies validate ownership ("author_id = auth.uid()"),
-- never account status. A user who keeps their JWT can call PostgREST/RPC
-- directly after suspension and continue writing. The app-side helper also
-- failed open (a swallowed lookup error read as "active") — fixed in the app
-- half of this packet.
--
-- DESIGN. One predicate, one trigger, applied across the member-write surface
-- by a catalog-driven loop — not 54 hand-edited policies (editing instances
-- instead of the pattern is how the two missed shims happened before).
--
--   public.member_write_allowed(uuid)  DEFINER, fail-closed: a missing profile
--                                      row or any status other than 'active'
--                                      returns false. Never "unknown = allow".
--   public.enforce_active_member()     BEFORE INSERT/UPDATE/DELETE trigger that
--                                      raises 'account_not_active' when the
--                                      CURRENT caller is a member (auth.uid()
--                                      present) and not active. service_role
--                                      and internal/definer paths pass through,
--                                      so moderation, outbox drains and admin
--                                      commands still work on a suspended
--                                      member's rows — which is required: we
--                                      must still be able to act ON them.
--
-- Deliberate scope: applied to the member-content and member-action tables
-- where a suspended user could otherwise keep participating. NOT applied to
-- rows the platform writes about a member (notifications, login_events,
-- moderation records), because suspending someone must not stop the system
-- from recording facts about them.

create or replace function public.member_write_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.account_status = 'active'
       and (p.suspended_until is null or p.suspended_until <= now())
       from public.profiles p
      where p.id = p_user),
    false            -- fail closed: no row, no permission
  );
$$;

revoke all on function public.member_write_allowed(uuid) from public, anon;
grant execute on function public.member_write_allowed(uuid) to authenticated, service_role;

comment on function public.member_write_allowed is
  'KFU-028: is this member allowed to write right now. Fail-closed — a missing profile or any '
  'non-active status returns false. Bound by callers to auth.uid(); never an arbitrary-subject oracle '
  'beyond what a member can already read about themselves.';

create or replace function public.enforce_active_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  -- No JWT subject: service_role, definer commands, triggers, cron. Those must
  -- keep working against a suspended member's rows.
  if v_uid is null then
    return coalesce(new, old);
  end if;
  if not public.member_write_allowed(v_uid) then
    raise exception 'account_not_active'
      using errcode = 'P0001',
            hint = 'This account is suspended or banned and cannot make changes.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.enforce_active_member() from public, anon, authenticated;

comment on function public.enforce_active_member is
  'KFU-028 belt: refuses member writes from a suspended or banned account, at the table boundary, '
  'so a retained JWT calling PostgREST directly is denied the same as the app.';

-- Apply across the member-write surface in one loop. Adding a table here is the
-- only edit a future member-content table needs.
do $$
declare
  t text;
  tables text[] := array[
    'posts','post_comments','post_likes','post_media','messages','conversations',
    'friendships','follows','blocks','marketplace_listings','listing_offers',
    'listing_meetups','listing_reports','matches','match_participants','match_invites',
    'events','event_rsvps','teams','team_members','team_join_requests','team_matches',
    'classes','class_enrollments','court_reviews','court_checkins','court_suggestions',
    'player_sports','join_requests','tournament_registrations'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice '0279: skipping %, not present', t;
      continue;
    end if;
    execute format('drop trigger if exists enforce_active_member on public.%I', t);
    execute format(
      'create trigger enforce_active_member before insert or update or delete on public.%I '
      'for each row execute function public.enforce_active_member()', t);
  end loop;
end $$;

select public.journal_migration('0279', '0279_active_member_write_gate.sql', null,
  'KFU-028 authoritative containment: a fail-closed member_write_allowed predicate plus an enforce_active_member trigger applied across the member-write surface, so a suspended or banned account with a retained JWT cannot write through PostgREST or RPC. Service and definer paths pass through so moderation still works.');
