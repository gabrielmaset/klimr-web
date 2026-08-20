-- 0107_payment_refunds.sql — registration-fee accounting:
-- adds the `refunded` payment status so returned fees are first-class in the
-- payments report (forfeits are derived: cancelled/disqualified + confirmed).

do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'tournament_registrations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%payment_status%'
  loop
    execute format('alter table public.tournament_registrations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.tournament_registrations
  add constraint tournament_registrations_payment_status_check
  check (payment_status in ('unpaid','proof_submitted','confirmed','denied','refunded'));
