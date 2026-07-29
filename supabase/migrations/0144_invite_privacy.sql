-- 0144_invite_privacy.sql — "Who can invite me" becomes ENFORCED, not cosmetic.
-- Design: user_preferences.who_can_invite ('anyone' | 'nobody') is mirrored to
-- profiles.open_to_invites by trigger (indexed, readable under existing profile
-- RLS, so every picker can filter it in one indexed predicate). Enforcement is
-- a BEFORE INSERT trigger on match_invites AND team_invites — triggers bind the
-- service role too (team invites are created service-side), unlike RLS. The
-- trigger also refuses invites across a block in either direction. Idempotent.

-- ── mirror flag ───────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists open_to_invites boolean not null default true;

update public.profiles p
set open_to_invites = false
from public.user_preferences up
where up.user_id = p.id and up.who_can_invite = 'nobody' and p.open_to_invites;

create or replace function public.sync_open_to_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set open_to_invites = (coalesce(new.who_can_invite, 'anyone') <> 'nobody')
  where id = new.user_id
    and open_to_invites is distinct from (coalesce(new.who_can_invite, 'anyone') <> 'nobody');
  return new;
end $$;

drop trigger if exists user_prefs_sync_invites on public.user_preferences;
create trigger user_prefs_sync_invites
  after insert or update of who_can_invite on public.user_preferences
  for each row execute function public.sync_open_to_invites();

-- ── enforcement ───────────────────────────────────────────────────────────────
create or replace function public.enforce_invite_privacy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select open_to_invites from public.profiles where id = new.invited_user_id), true) then
    raise exception 'not open to invites';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.invited_user_id and b.blocked_id = new.invited_by)
       or (b.blocker_id = new.invited_by and b.blocked_id = new.invited_user_id)
  ) then
    raise exception 'not open to invites';
  end if;
  return new;
end $$;

drop trigger if exists match_invites_privacy on public.match_invites;
create trigger match_invites_privacy
  before insert on public.match_invites
  for each row execute function public.enforce_invite_privacy();

drop trigger if exists team_invites_privacy on public.team_invites;
create trigger team_invites_privacy
  before insert on public.team_invites
  for each row execute function public.enforce_invite_privacy();

create index if not exists profiles_open_to_invites_idx
  on public.profiles (open_to_invites) where open_to_invites = false;
