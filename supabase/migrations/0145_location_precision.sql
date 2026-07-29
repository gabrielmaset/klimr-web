-- 0145_location_precision.sql — location precision becomes a real, enforced
-- privacy control. user_preferences.location_precision ('city' | 'neighborhood'
-- | 'zip') mirrors to profiles.location_precision by trigger — same pattern as
-- open_to_invites (0144) — so every surface that renders another player's
-- location reads the tier in the same row it already fetches. Display rule:
--   city         → city only
--   neighborhood → neighborhood + city (default)
--   zip          → neighborhood + city + ZIP (most precise)
-- Rankings stay ZIP-scoped regardless (the ladder IS the ZIP); this governs
-- what the PROFILE reveals. Idempotent.

alter table public.profiles add column if not exists location_precision text not null default 'neighborhood';

do $$ begin
  alter table public.profiles add constraint profiles_location_precision_check
    check (location_precision in ('city','neighborhood','zip'));
exception when duplicate_object then null; end $$;

update public.profiles p
set location_precision = up.location_precision
from public.user_preferences up
where up.user_id = p.id
  and up.location_precision in ('city','neighborhood','zip')
  and p.location_precision is distinct from up.location_precision;

create or replace function public.sync_location_precision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.location_precision, '') in ('city','neighborhood','zip') then
    update public.profiles
    set location_precision = new.location_precision
    where id = new.user_id
      and location_precision is distinct from new.location_precision;
  end if;
  return new;
end $$;

drop trigger if exists user_prefs_sync_location on public.user_preferences;
create trigger user_prefs_sync_location
  after insert or update of location_precision on public.user_preferences
  for each row execute function public.sync_location_precision();
