-- 0237_privacy_predicate_binding.sql — closes the arbitrary-pair relationship
-- oracles by removing member EXECUTE on the raw predicates and exposing only
-- caller-bound wrappers.
--
-- KRA-009 (P1, re-audit 2026-08-10). 0233 and 0234 granted EXECUTE on predicates
-- that accept ANY two member UUIDs to `authenticated`:
--   may_act_on(actor, subject, action) · may_see_connections(viewer, subject)
--   may_see_schedule(viewer, subject)  · is_muted_by(viewer, author)
--   is_restricted_by(owner, commenter) · comment_visible_to(comment, viewer)
-- Any member could therefore iterate pairs over PostgREST and read back the
-- relationship state of two strangers.
--
-- That is worst for mute and restrict. Owner decision D-13 says all three lists
-- are SILENT and "the other person is never told" — an RPC that answers
-- `is_muted_by(x, y)` for arbitrary x and y contradicts a recorded product
-- decision, not merely a security preference.
--
-- Why revoking is safe here and NOT safe for is_blocked_pair:
--   These six functions have ZERO call sites (that absence is KRA-008, the
--   companion finding). Revoking member EXECUTE therefore changes no behaviour
--   at all today, and the enforcement work lands on the bound wrappers below.
--   `is_blocked_pair` is different: it is called from 27 places including live
--   RLS policies. Measured, not assumed — revoking it and reading `posts` as a
--   member produces `ERROR: permission denied for function is_blocked_pair`,
--   because a policy expression is evaluated with the querying role's rights.
--   So it keeps its grant and gets an in-body caller guard instead.

-- ── 1. member EXECUTE comes off the raw pair predicates ───────────────────
-- FROM PUBLIC as well as from the named roles, and this is not belt-and-braces:
-- my first draft revoked from `authenticated` only and the new sentinel failed,
-- because `has_function_privilege('authenticated', …)` was still TRUE. A function
-- carries an implicit PUBLIC EXECUTE entry, so `authenticated` keeps the privilege
-- through PUBLIC no matter what is revoked from the role itself.
--
-- That is KRA-003 of this same audit, demonstrated on our own new code: 0196
-- rewrote grants but only for functions whose ACL text ALREADY listed a PUBLIC
-- entry, and missed exactly this. Recorded here because the sentinel caught it in
-- one replay and a code review would not have.
revoke execute on function public.may_act_on(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.may_see_connections(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.may_see_schedule(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_muted_by(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_restricted_by(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.comment_visible_to(uuid, uuid) from public, anon, authenticated;

-- The raw predicates stay reachable where they belong: policy code, triggers and
-- controlled commands, all of which run as the definer or as service_role.
grant execute on function public.may_act_on(uuid, uuid, text) to service_role;
grant execute on function public.may_see_connections(uuid, uuid) to service_role;
grant execute on function public.may_see_schedule(uuid, uuid) to service_role;
grant execute on function public.is_muted_by(uuid, uuid) to service_role;
grant execute on function public.is_restricted_by(uuid, uuid) to service_role;
grant execute on function public.comment_visible_to(uuid, uuid) to service_role;

-- ── 2. the caller-bound API members are allowed to ask ────────────────────
-- Each derives the actor/viewer from auth.uid(), so the only relationship a
-- member can interrogate is one they are part of. SECURITY DEFINER so the
-- wrapper can reach the revoked predicate the caller no longer may.
create or replace function public.can_i_act_on(p_subject uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.may_act_on(auth.uid(), p_subject, p_action); $$;

create or replace function public.can_i_see_connections(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.may_see_connections(auth.uid(), p_subject); $$;

create or replace function public.can_i_see_schedule(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.may_see_schedule(auth.uid(), p_subject); $$;

create or replace function public.can_i_see_comment(p_comment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.comment_visible_to(p_comment, auth.uid()); $$;

revoke execute on function public.can_i_act_on(uuid, text) from public, anon;
revoke execute on function public.can_i_see_connections(uuid) from public, anon;
revoke execute on function public.can_i_see_schedule(uuid) from public, anon;
revoke execute on function public.can_i_see_comment(uuid) from public, anon;
grant execute on function public.can_i_act_on(uuid, text) to authenticated, service_role;
grant execute on function public.can_i_see_connections(uuid) to authenticated, service_role;
grant execute on function public.can_i_see_schedule(uuid) to authenticated, service_role;
grant execute on function public.can_i_see_comment(uuid) to authenticated, service_role;

comment on function public.can_i_act_on is
  'KRA-009: the member-facing form of may_act_on. The actor is auth.uid() and cannot be supplied, so '
  'a member can ask about their own permissions and nobody else''s pair.';

-- Deliberately NO member-facing wrapper for is_muted_by / is_restricted_by.
-- Mute and restrict are silent by owner decision D-13: the subject is never told.
-- A wrapper that answered "has this person muted me" would disclose exactly the
-- thing the feature promises not to. Both remain available to service_role and to
-- SECURITY DEFINER policy code, which is where they belong.

-- ── 3. is_blocked_pair keeps its grant and gains a caller guard ───────────
-- Rewritten as plpgsql only to make the guard explicit and evaluated FIRST; the
-- returned predicate is byte-identical to the 0099 body.
--
-- `auth.uid() is null` is allowed on purpose: service_role and trigger/system
-- contexts carry no member identity, and the notification block trigger
-- (0209) legitimately tests a pair the caller is not part of.
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- A member may only ask about a pair they belong to. Anything else is an
  -- enumeration of other people's blocks.
  if auth.uid() is not null and auth.uid() <> a and auth.uid() <> b then
    raise exception 'not_your_pair' using errcode = '42501';
  end if;

  return exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
end; $$;

-- Grants unchanged from 0209: policies need it, and the guard is what makes that safe.
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated, service_role;

comment on function public.is_blocked_pair is
  'The single symmetric test for "these two must not see each other". Callable by authenticated '
  'because RLS policy expressions run with the querying role''s rights (measured: revoking it makes '
  'reading posts fail outright). KRA-009 adds the caller guard so it cannot be used to enumerate '
  'third-party blocks.';

-- ── 4. boundary sentinel ──────────────────────────────────────────────────
create or replace function public.privacy_oracle_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no member EXECUTE on any raw pair predicate
    not has_function_privilege('authenticated', 'public.may_act_on(uuid, uuid, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.may_see_connections(uuid, uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.may_see_schedule(uuid, uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.is_muted_by(uuid, uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.is_restricted_by(uuid, uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.comment_visible_to(uuid, uuid)', 'EXECUTE')
    -- the bound wrappers ARE available, or enforcement has nothing to call
    and has_function_privilege('authenticated', 'public.can_i_act_on(uuid, text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.can_i_see_connections(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.can_i_see_schedule(uuid)', 'EXECUTE')
    -- and the block test still carries its caller guard
    and (
      select pg_get_functiondef(p.oid) like '%not_your_pair%'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'is_blocked_pair'
       limit 1
    );
$$;

revoke all on function public.privacy_oracle_intact() from anon, authenticated, public;
grant execute on function public.privacy_oracle_intact() to service_role;

-- ── 5. readiness floor moves with the new sentinel ────────────────────────
create or replace function public.klimr_ready(p_min_checks integer default 19)
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
