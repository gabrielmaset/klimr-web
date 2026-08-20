-- 0206_public_profile_derived.sql — KCDX-026, and a regression from 0191.
--
-- ── the regression, first, because it is live ────────────────────────────
-- 0191 revoked the private profile columns from members. Four call sites were
-- still reading them with the caller's own session, and the largest is
-- `/profile/[id]`: it selected `date_of_birth`, `birth_year`, `home_zip`,
-- `neighborhood` and `account_status` for ANOTHER member, then did `.single()`
-- and `if (!profileRow) notFound()`. With 0191 applied that select raises
-- `permission denied`, the row is null, and **every member profile page returns
-- 404**. The guardrail I wrote for 0191 checked whether a privileged client
-- existed anywhere in the FILE, not whether this statement used one — and this
-- file has an admin client two hundred lines further down for something else. A
-- file-level test cannot answer a statement-level question.
--
-- ── KCDX-026 ─────────────────────────────────────────────────────────────
-- `location-privacy.ts` states the rule plainly: other members see CITY, STATE.
-- The discovery RPCs, the search subtitle and the PYMK rail were all reaching for
-- `neighborhood` first. Removing it from the reads is most of the fix; removing
-- it from the DTO is the rest, so the next feature cannot reach for it either.
--
-- ── what this migration adds ─────────────────────────────────────────────
-- Age. The profile page shows it, and it can no longer read a birth date to
-- compute one — correctly, because a date of birth is identifying in a way an
-- age is not. So the projection publishes the DERIVED value and keeps the
-- source private, exactly as `is_active` publishes a state without publishing
-- `account_status`. Same principle, second application.

drop view if exists public.profiles_public;

-- security_invoker = FALSE, deliberately, and this is the subtlety that broke the
-- first attempt. With `security_invoker = true` the view reads the base table as
-- the CALLER, and the caller has no grant on `date_of_birth` or `birth_year` —
-- so the moment this projection derived `age` from them, selecting any column of
-- the view raised `permission denied for table profiles`. Running as definer is
-- what lets a projection publish something computed from data the reader may not
-- see, which is the entire point of having a projection. It is the same choice
-- `profile_private` makes, for the same reason.
--
-- Row visibility is unchanged: the policy this replaces was `USING (true)` for
-- authenticated, so every member could already see every row of these columns.
create view public.profiles_public
with (security_invoker = false) as
select
  p.id,
  p.display_name,
  p.avatar_hue,
  p.avatar_path,
  p.cover_path,
  p.bio,
  p.city,
  p.state,
  p.country,
  p.primary_sport,
  p.verification_status,
  p.reliability,
  p.connections_count,
  p.followers_count,
  p.following_count,
  p.member_no,
  p.created_at,
  p.last_seen_at,
  p.presence_mode,
  p.open_to_invites,
  p.show_courts,
  p.show_teams,
  p.show_tournaments,
  p.gear,
  p.profile_gallery,
  p.usual_times,
  p.play_style,
  p.preferred_format,
  p.handedness,
  p.is_active,
  -- Derived, not sourced. Mirrors lib/age.ts: prefer the date of birth, fall
  -- back to the birth year. Neither leaves the row.
  case
    when p.date_of_birth is not null
      then greatest(0, extract(year from age(p.date_of_birth))::int)
    when p.birth_year is not null and p.birth_year > 1900
      then greatest(0, extract(year from current_date)::int - p.birth_year)
    else null
  end as age
from public.profiles p;

grant select on public.profiles_public to authenticated;

comment on view public.profiles_public is
  'KCDX-001/026: the approved member-facing projection. Publishes derived values (is_active, age) '
  'and never their sources (account_status, date_of_birth, birth_year). No neighborhood, by design — '
  'lib/location-privacy.ts specifies CITY, STATE as the published grain.';
