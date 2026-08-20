-- 0091_player_sports_active.sql — hide a sport without losing its stats.
-- De-selecting a sport in Settings now flips active=false instead of deleting the
-- row, so points, win/loss record, and skill rating are preserved and restored
-- intact if the player adds the sport back later. Profiles show only active sports.
-- Existing rows default to active=true, so nothing currently visible disappears.
alter table public.player_sports
  add column if not exists active boolean not null default true;
