-- 0271_adult_platform_gate.sql — the database refuses a minor birth date.
--
-- D-38: the platform is 18+ only. Two layers already exist — the onboarding
-- form rejects under-18 dates client-side, and the server action rejects them
-- again ("Klimr is 18+ during the beta"). This is the third and final layer:
-- a trigger on profiles, so no future code path, admin tool, import, or
-- direct write can store a minor birth date. Defense in depth, not a gap fix.
--
-- The backfill assertion fails LOUDLY if any existing row already violates
-- the rule: production holds only test accounts, so a violation here means
-- drift worth stopping a deployment over, not something to paper over.

create or replace function public.profiles_enforce_adult()
returns trigger
language plpgsql
as $$
begin
  if new.date_of_birth is not null
     and new.date_of_birth > (current_date - interval '18 years') then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;
  if new.birth_year is not null
     and new.birth_year > extract(year from current_date)::int - 18 then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_enforce_adult() from public, anon, authenticated;

drop trigger if exists profiles_enforce_adult on public.profiles;
create trigger profiles_enforce_adult
  before insert or update of date_of_birth, birth_year on public.profiles
  for each row execute function public.profiles_enforce_adult();

do $$
declare
  v_bad int;
begin
  v_bad := (
    select count(*) from public.profiles p
     where (p.date_of_birth is not null
            and p.date_of_birth > (current_date - interval '18 years'))
        or (p.birth_year is not null
            and p.birth_year > extract(year from current_date)::int - 18)
  );
  if v_bad > 0 then
    raise exception 'adult_gate_backfill: % existing profile(s) violate the 18 plus rule', v_bad;
  end if;
end $$;

select public.journal_migration('0271', '0271_adult_platform_gate.sql', null,
  'Database belt for the 18 plus rule: a trigger rejects minor birth dates on profiles and the backfill was asserted clean.');
