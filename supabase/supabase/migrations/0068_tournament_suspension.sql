-- 0068_tournament_suspension.sql — admin moderation: suspend a tournament for
-- review (or delete it). Suspension is orthogonal to the lifecycle status: a
-- suspended event keeps its real status but is hidden from the public, and the
-- organizer sees a banner. Restoring clears these columns and the event returns
-- to exactly its prior state.
--
-- Mirrors the account-suspension security model (0008): moderation state is
-- writable ONLY by the service role (admin actions). A guard trigger reverts any
-- attempt by an organizer to change it. Idempotent.

alter table public.tournaments add column if not exists suspended_at     timestamptz;
alter table public.tournaments add column if not exists suspended_by     uuid references public.profiles(id) on delete set null;
alter table public.tournaments add column if not exists suspended_reason text;

-- A suspended event is invisible to the public (its /e/<code> page 404s). The
-- organizer still reaches the workspace because that is gated by ownership, not
-- visibility.
create or replace function public.tournament_is_visible(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = tid
      and t.status not in ('draft','cancelled')
      and t.suspended_at is null
  );
$$;
grant execute on function public.tournament_is_visible(uuid) to anon, authenticated;

-- Only the service role may set/clear suspension; revert any other writer.
create or replace function public.guard_tournament_suspension()
returns trigger language plpgsql as $$
begin
  if (new.suspended_at is distinct from old.suspended_at
      or new.suspended_by is distinct from old.suspended_by
      or new.suspended_reason is distinct from old.suspended_reason)
     and current_user <> 'service_role' then
    new.suspended_at := old.suspended_at;
    new.suspended_by := old.suspended_by;
    new.suspended_reason := old.suspended_reason;
  end if;
  return new;
end; $$;

drop trigger if exists guard_tournament_suspension on public.tournaments;
create trigger guard_tournament_suspension before update on public.tournaments
  for each row execute function public.guard_tournament_suspension();
