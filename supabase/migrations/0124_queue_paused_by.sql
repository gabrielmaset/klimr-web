-- 0124_queue_paused_by.sql — record WHO paused a live queue so every surface
-- (courtside display, queue page, walk-up) can say "Gabriel has paused the
-- games" instead of an anonymous pause. Cleared on resume and on any reset.
alter table public.court_sessions
  add column if not exists paused_by uuid references public.profiles(id) on delete set null;
