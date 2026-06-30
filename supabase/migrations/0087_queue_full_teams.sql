-- 0087_queue_full_teams.sql — optional "complete teams can join the line at once".
--
-- When an organizer turns this on, a group can drop a full team straight into the queue
-- instead of filling open spots one by one. Queue order is anchored to when each team's
-- FIRST player joined (the team row's created_at), so a forming team that started earlier
-- keeps priority once it fills — a full team that joined later can't jump ahead of it.

alter table public.court_sessions add column if not exists allow_full_teams boolean not null default false;
