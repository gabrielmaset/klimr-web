-- 0152_event_date_guard.sql — an end date can never precede the start.
-- When an organizer moves an event's (or tournament's) start, a stale end
-- date used to be able to sit BEFORE it. DB-enforced auto-heal: whenever
-- ends_at < starts_at, ends_at snaps to the START's calendar day keeping its
-- own clock time; if that still lands before the start (end time earlier in
-- the day), ends_at becomes exactly starts_at. Covers every write path —
-- edit forms, wizards, API — with zero app-side duplication. Idempotent.

create or replace function public.heal_end_after_start()
returns trigger language plpgsql as $$
declare candidate timestamptz;
begin
  if new.starts_at is not null and new.ends_at is not null and new.ends_at < new.starts_at then
    candidate := date_trunc('day', new.starts_at) + (new.ends_at - date_trunc('day', new.ends_at));
    if candidate < new.starts_at then candidate := new.starts_at; end if;
    new.ends_at := candidate;
  end if;
  return new;
end $$;

drop trigger if exists events_end_after_start on public.events;
create trigger events_end_after_start
  before insert or update of starts_at, ends_at on public.events
  for each row execute function public.heal_end_after_start();

drop trigger if exists tournaments_end_after_start on public.tournaments;
create trigger tournaments_end_after_start
  before insert or update of starts_at, ends_at on public.tournaments
  for each row execute function public.heal_end_after_start();
