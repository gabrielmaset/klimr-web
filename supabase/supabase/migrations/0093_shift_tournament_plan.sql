-- 0093_shift_tournament_plan.sql — moves every day-planner item for a tournament
-- by a time interval, in one set-based UPDATE. Called when the organizer changes
-- the event's start, so the run-of-show follows the new date while each item keeps
-- its time-of-day and multi-day offset (the plans are kept, only their dates move).
-- Runs with invoker rights, so the tournament_plan_items RLS policy (staff-only)
-- governs which rows move — a non-staff caller shifts nothing. Idempotent.

create or replace function public.shift_tournament_plan(p_tournament uuid, p_shift interval)
returns void
language sql
as $$
  update public.tournament_plan_items
     set starts_at = starts_at + p_shift,
         ends_at   = case when ends_at is not null then ends_at + p_shift else null end
   where tournament_id = p_tournament
     and p_shift is not null
     and p_shift <> interval '0';
$$;

grant execute on function public.shift_tournament_plan(uuid, interval) to authenticated;
grant execute on function public.shift_tournament_plan(uuid, interval) to service_role;
