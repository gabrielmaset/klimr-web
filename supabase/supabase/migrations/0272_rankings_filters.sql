-- 0272_rankings_filters.sql — the leaderboard learns demographics, courtesy
-- boundaries, and windows. D-39, database half.
--
-- ranked_players(sport, scope, region) already existed (0120) and the board
-- already fans out per scope. This extends the SAME function with the D-39
-- filter set while keeping every existing semantic: the 180-day activity
-- gate, archived-account exclusion, the scope ladder, points ordering.
--
-- WHAT CHANGES AND WHY:
--   security definer  The filters read profiles.gender and
--                     profiles.date_of_birth, which members deliberately
--                     cannot read (column privileges). An INVOKER body would
--                     fail the whole statement on privilege check (0264
--                     lesson). The function returns the same display fields
--                     as before — raw gender and birth dates never leave it.
--   p_gender          Exact-match filter over the onboarding vocabulary.
--   p_age_min/max     Bracket bounds in whole years, computed from
--                     date_of_birth. Rows with no birth date are excluded
--                     whenever an age filter is active: an unverifiable
--                     bracket is not a match.
--   block exclusion   A player the viewer blocked, or who blocked the
--                     viewer, no longer appears on the viewer's board.
--                     Bound to auth.uid() only — not an arbitrary-pair
--                     oracle. Deliberate behavior change.
--   p_offset/p_limit  Server-side windowing for the rank-jump path at scale.
--                     Rank is computed BEFORE the window so a slice carries
--                     true global ranks. Null keeps the legacy full return.
--
-- The old three-argument signature is DROPPED, not overloaded: two matching
-- candidates would make named-parameter calls ambiguous. The deployed board
-- calls with three named arguments and resolves through the defaults — the
-- rolling-compat pattern this project pinned during the feed incident.

drop function if exists public.ranked_players(text, text, text);

create or replace function public.ranked_players(
  p_sport   text,
  p_scope   text default 'world',
  p_region  text default null,
  p_gender  text default null,
  p_age_min int  default null,
  p_age_max int  default null,
  p_offset  int  default null,
  p_limit   int  default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_hue int,
  verification_status public.verification_status,
  points int,
  skill_rating numeric,
  matches_played int,
  wins int,
  last_result_at timestamptz,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      ps.user_id,
      pr.display_name,
      pr.avatar_hue,
      pr.verification_status,
      ps.points,
      ps.skill_rating,
      ps.matches_played,
      ps.wins,
      ps.last_result_at,
      rank() over (order by ps.points desc) as rank
    from public.player_sports ps
    join public.profiles pr on pr.id = ps.user_id
    where ps.sport_key = p_sport
      and pr.account_status <> 'archived'
      and ps.last_result_at >= now() - interval '180 days'
      and case p_scope
        when 'world' then true
        when 'national' then pr.country is not distinct from coalesce(p_region, pr.country)
        when 'state' then pr.state is not distinct from p_region
        when 'city' then pr.city is not distinct from p_region
        when 'neighborhood' then pr.neighborhood is not distinct from p_region
        when 'zip' then pr.home_zip is not distinct from p_region
        else false
      end
      and (p_gender is null or pr.gender = p_gender)
      and (p_age_min is null
           or (pr.date_of_birth is not null
               and pr.date_of_birth <= current_date - (p_age_min * interval '1 year')))
      and (p_age_max is null
           or (pr.date_of_birth is not null
               and pr.date_of_birth >  current_date - ((p_age_max + 1) * interval '1 year')))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = ps.user_id)
           or (b.blocker_id = ps.user_id and b.blocked_id = auth.uid())
      )
  )
  select r.user_id, r.display_name, r.avatar_hue, r.verification_status,
         r.points, r.skill_rating, r.matches_played, r.wins, r.last_result_at, r.rank
    from ranked r
   where p_offset is null or r.rank > p_offset
   order by r.rank
   limit coalesce(p_limit, 2147483647);
$$;

revoke all on function public.ranked_players(text, text, text, text, int, int, int, int) from public, anon;
grant execute on function public.ranked_players(text, text, text, text, int, int, int, int) to authenticated, service_role;

comment on function public.ranked_players is
  'The leaderboard. DEFINER because the demographic filters read member-hidden profile columns; '
  'returns only display fields. Rank is computed before the window so slices carry true global '
  'ranks. Viewer-bound block exclusion. Legacy three-argument callers resolve through defaults.';

select public.journal_migration('0272', '0272_rankings_filters.sql', null,
  'ranked_players gains gender and age bracket filters, viewer-bound block exclusion, and rank-true windowing. Switched to definer because the filters read member-hidden profile columns while returning only display fields.');
