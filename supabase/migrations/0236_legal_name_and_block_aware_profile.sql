-- 0236_legal_name_and_block_aware_profile.sql — removes legal name from the member
-- column grant, keeps gender public per owner decision OD-5, and makes the public
-- profile projection block-aware in both directions.
--
-- KRA-010 (P1, re-audit 2026-08-10). 0191 built the profile privacy boundary and
-- said so in its own header: "NOT SOLVED HERE, deliberately: first_name/last_name
-- stay readable." 0233 then wrote that legal names are private and removed them
-- from `profiles_public` — but never revoked the base-table column grant 0191 had
-- issued. So the documentation said one thing and `grant select (… first_name,
-- last_name …) on public.profiles to authenticated` said another, and PostgREST
-- answered to the grant.
--
-- The second half is blocking. `profiles_public` is `security_invoker = false`, so
-- RLS on `profiles` does not constrain it and it returned every row to every
-- caller — including rows for members who had blocked the caller, which
-- docs/RELATIONSHIP-PRIVACY-POLICY.md states are unavailable.
--
-- Owner decisions applied:
--   OD-5: legal name is owner-only. `gender` is PUBLIC and stays granted.

-- ── 1. legal name leaves the member-readable column set ───────────────────
-- Column privileges are additive and cannot be subtracted from a wider grant
-- (0191 learned this the hard way), but here the table grant is already revoked
-- and only named columns are granted — so revoking two of those names is exact.
revoke select (first_name, last_name) on public.profiles from authenticated;
revoke select (first_name, last_name) on public.profiles from anon;

comment on column public.profiles.first_name is
  'Verification data. Owner-readable through profile_private only; never granted to authenticated on '
  'this table (KRA-010 / OD-5). Members see display_name and the optional public nickname.';
comment on column public.profiles.last_name is
  'Verification data. See first_name.';

-- `gender` is deliberately NOT revoked. Owner decision OD-5 (2026-08-10) states it
-- is public. It stays in the grant, and section 3 adds it to the projection so the
-- two surfaces cannot disagree about it the way they disagreed about legal name.

-- ── 2. the block test needs an index to be cheap in a projection ──────────
-- `is_blocked_pair` does an EXISTS both ways. `blocks_blocked_idx` (0099) covers
-- one direction; the owner side is the primary key's leading column. Adding the
-- reverse composite keeps the per-row test index-only in both directions, which is
-- what makes it acceptable inside a view that directory pages scan.
create index if not exists blocks_pair_reverse_idx
  on public.blocks (blocked_id, blocker_id);

-- ── 3. the public projection becomes caller-aware ─────────────────────────
-- Recreated rather than altered: a view's column list cannot be changed in place.
-- `security_invoker = false` is retained deliberately — 0206 established that a
-- projection publishing a DERIVED value (age) computed from columns the reader
-- cannot see must run as the definer. Caller-awareness therefore has to be written
-- into the view body, which is what the `not is_blocked_pair(...)` predicate does.
drop view if exists public.profiles_public;
create view public.profiles_public
with (security_invoker = false) as
select
  p.id, p.display_name, p.nickname,
  p.avatar_hue, p.avatar_path, p.cover_path, p.bio,
  p.city, p.state, p.country, p.primary_sport,
  p.gender,
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
from public.profiles p
-- A block hides the profile in BOTH directions and is symmetric by construction,
-- so neither party can use the directory to watch the other. `auth.uid()` is null
-- for service-role and unauthenticated reads; `is_blocked_pair(null, x)` is false,
-- so those paths are unchanged and admin tooling keeps working.
where not public.is_blocked_pair(auth.uid(), p.id);

grant select on public.profiles_public to authenticated;

comment on view public.profiles_public is
  'KCDX-001/026/032 + KRA-010: the approved member-facing projection. Publishes derived values '
  '(is_active, age) and never their sources. Carries display_name, the optional public nickname and '
  'gender (public per owner decision OD-5). Legal name is never here AND is no longer granted on the '
  'base table. Block-aware in both directions: a blocked pair cannot retrieve each other.';

-- ── 4. boundary sentinel ──────────────────────────────────────────────────
-- Named to be discovered by klimr_readiness() (0223).
create or replace function public.legal_name_boundary_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- neither member role may read legal name off the base table
    not has_column_privilege('authenticated', 'public.profiles', 'first_name', 'SELECT')
    and not has_column_privilege('authenticated', 'public.profiles', 'last_name', 'SELECT')
    and not has_column_privilege('anon', 'public.profiles', 'first_name', 'SELECT')
    and not has_column_privilege('anon', 'public.profiles', 'last_name', 'SELECT')
    -- and it is not in the projection either
    and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles_public'
         and column_name in ('first_name', 'last_name')
    )
    -- gender IS public, per OD-5 — asserted so a later "tidy-up" cannot quietly
    -- remove a field the owner decided was public
    and has_column_privilege('authenticated', 'public.profiles', 'gender', 'SELECT')
    -- the projection consults the block test
    and exists (
      select 1 from pg_views
       where schemaname = 'public' and viewname = 'profiles_public'
         and definition like '%is_blocked_pair%'
    );
$$;

revoke all on function public.legal_name_boundary_intact() from anon, authenticated, public;
grant execute on function public.legal_name_boundary_intact() to service_role;

-- ── 5. readiness floor moves with the new sentinel ────────────────────────
create or replace function public.klimr_ready(p_min_checks integer default 18)
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
