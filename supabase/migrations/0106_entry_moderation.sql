-- 0106_entry_moderation.sql — organizer entry moderation:
-- adds `moderation_note` (the reason / required fix) and extends the
-- registration status set with `disqualified` and `under_review`.
-- Under-review entries HOLD their spot; cancelled/withdrawn/disqualified free it.

alter table public.tournament_registrations
  add column if not exists moderation_note text;

-- Rebuild whatever check constraint governs `status` with the full set.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'tournament_registrations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.tournament_registrations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.tournament_registrations
  add constraint tournament_registrations_status_check
  check (status in ('pending','confirmed','waitlisted','withdrawn','cancelled','disqualified','under_review'));
