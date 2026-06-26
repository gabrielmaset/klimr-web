-- ============================================================
-- 0005 — Per-sport play preferences
-- Format and racquet hand move from a single profile-level value to one
-- value PER SPORT, since a player may favour singles in one sport and
-- doubles in another (and, rarely, a different hand).
--
-- Run AFTER 0002. Safe to run more than once.
--
-- Security note: player_sports already has an "update own player_sports"
-- policy (0002) plus the guard_player_stats trigger that freezes
-- points / wins / matches_played for non-service callers. These two new
-- columns are NOT touched by that guard, so they stay freely self-editable
-- exactly like skill_level and skill_rating. No policy change required.
-- ============================================================

alter table public.player_sports
  add column if not exists preferred_format text not null default 'both'
    check (preferred_format in ('singles','doubles','both')),
  add column if not exists handedness text
    check (handedness in ('right','left','either'));

-- profiles.preferred_format / handedness (from 0002) are kept as a convenience
-- summary mirror of the PRIMARY sport's values; play_style stays profile-level.
