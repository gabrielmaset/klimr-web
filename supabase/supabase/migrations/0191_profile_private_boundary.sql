-- 0191_profile_private_boundary.sql — KCDX-001 (P0): members can read every
-- other member's date of birth, phone, home ZIP, availability and account state.
--
-- THE ACTUAL PROBLEM. `profiles` carries a SELECT policy of `true` for the
-- `authenticated` role, and the table holds identity and contact data. RLS is
-- row-level: a policy of `true` means every row, and a table-level GRANT means
-- every column. So any member, with nothing but their own JWT and the public
-- anon key, can ask PostgREST for `select=date_of_birth,phone,home_zip` across
-- the whole membership. No UI is involved and no server action is bypassed —
-- the boundary is the database, and the database says yes.
--
-- WHY COLUMN PRIVILEGES AND NOT A POLICY. Postgres has no row-conditional column
-- security. A policy cannot say "your own row, all columns; other rows, some
-- columns". Column-level GRANTs can say "nobody reads these columns through this
-- role", and that is enforced by Postgres itself for every path — PostgREST,
-- a raw REST call, a wildcard `select=*`, an embedded resource, a future feature
-- someone writes in a hurry. That is the property this finding needs.
--
-- The two views then restore exactly the access the product legitimately has:
--
--   profile_private   your own row, every column. SECURITY DEFINER semantics
--                     (security_invoker = false) so it can read columns the
--                     caller cannot; `where id = auth.uid()` is the boundary and
--                     it is the whole boundary, which is why the definition is
--                     one line long and stays that way.
--
--   profiles_public   the deliberate directory projection — the columns one
--                     member may see of another, written out by name so that
--                     adding a column to `profiles` never silently widens it.
--                     security_invoker = true, so it keeps the caller's RLS: if
--                     a later batch narrows row visibility (blocks, suspension),
--                     this view narrows with it instead of quietly bypassing it.
--
-- NOT SOLVED HERE, deliberately: `first_name` / `last_name` stay readable. They
-- are PII and members never see them in the product, but the verification and
-- signup flows touch them from several directions and widening this batch to
-- cover them would mix a boundary fix with a refactor. Recorded as a follow-up
-- on KCDX-001 rather than done halfway.
--
-- WRITES ARE UNAFFECTED. UPDATE is a separate privilege; the settings actions
-- update their own private fields without asking for a representation back, so
-- no RETURNING clause needs SELECT. Triggers run as their owner and are unmoved.

-- ── 1. the boundary: default-deny on the base table ───────────────────────
-- Column-level REVOKE does not override a table-level GRANT — Postgres treats
-- column privileges as additive, so `revoke select (phone)` against a role that
-- holds table-wide SELECT changes nothing. (Confirmed the hard way: the first
-- cut of this migration did exactly that and a member could still read every
-- column.) The table grant has to go first; the public columns are then granted
-- back by name.
--
-- The pleasant consequence is default-deny for the future: a column added by a
-- later migration is NOT readable by members until someone grants it here, and
-- granting it is a visible, reviewable line of SQL.
revoke select on public.profiles from anon, authenticated;

-- `is_active` replaces the raw account state for member-facing surfaces. Lists
-- need to hide suspended members; that is a boolean, not a disciplinary record.
-- Generated and stored, so it cannot drift from account_status.
alter table public.profiles
  add column if not exists is_active boolean
  generated always as (account_status = 'active') stored;

-- The public column list. Everything not on it is private by construction.
grant select (
  id, display_name, first_name, last_name, gender,
  bio, avatar_hue, avatar_path, cover_path,
  city, state, country, location_precision, timezone,
  primary_sport, preferred_format, play_style, handedness, usual_times,
  verification_status, reliability, is_active,
  connections_count, followers_count, following_count, member_no,
  created_at, last_seen_at, presence_mode, open_to_invites,
  show_courts, show_teams, show_tournaments,
  gear, profile_gallery, search_tsv
) on public.profiles to authenticated;

-- ── 2. your own row, in full ───────────────────────────────────────────────
create or replace view public.profile_private
with (security_invoker = false) as
  select * from public.profiles where id = auth.uid();

revoke all on public.profile_private from public, anon;
grant select on public.profile_private to authenticated, service_role;

-- ── 3. what one member may see of another ──────────────────────────────────
-- Every column here is a deliberate decision. `is_active` replaces the raw
-- account state: surfaces need to hide suspended members, and that is a boolean,
-- not a disciplinary record.
create or replace view public.profiles_public
with (security_invoker = true) as
  select
    id,
    display_name,
    avatar_hue,
    avatar_path,
    cover_path,
    bio,
    city,
    state,
    country,
    primary_sport,
    verification_status,
    reliability,
    connections_count,
    followers_count,
    following_count,
    member_no,
    created_at,
    last_seen_at,
    presence_mode,
    open_to_invites,
    show_courts,
    show_teams,
    show_tournaments,
    gear,
    profile_gallery,
    usual_times,
    play_style,
    preferred_format,
    handedness,
    is_active
  from public.profiles;

revoke all on public.profiles_public from public, anon;
grant select on public.profiles_public to authenticated, service_role;

comment on view public.profiles_public is
  'KCDX-001: the approved member-to-member projection of public.profiles. '
  'Adding a column here is a privacy decision — make it deliberately.';
comment on view public.profile_private is
  'KCDX-001: your own profile row, every column. Restricted by `id = auth.uid()`; '
  'runs with definer rights so it can read columns revoked from the caller.';

-- ── 4. keep the boundary closed as the table grows ────────────────────────
-- Default-deny only holds while the table grant stays revoked. One `grant select
-- on public.profiles to authenticated` anywhere — a later migration, a dashboard
-- click, a copy-pasted fix for a 42501 — silently reopens all twelve columns.
-- The boot sentinel asks this function, so that reopening fails the deploy
-- instead of shipping quietly.
create or replace function public.profile_boundary_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from information_schema.column_privileges
     where table_schema = 'public'
       and table_name = 'profiles'
       and grantee in ('anon', 'authenticated')
       and privilege_type = 'SELECT'
       and column_name in (
         'date_of_birth','birth_year','phone','phone_country','home_zip',
         'neighborhood','availability','account_status','suspended_until',
         'archived_at','onboarding_draft','signup_code'
       )
  );
$$;

revoke all on function public.profile_boundary_intact() from public, anon, authenticated;
grant execute on function public.profile_boundary_intact() to service_role;
