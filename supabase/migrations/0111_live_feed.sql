-- 0111_live_feed.sql — the live regional feed (FEED-ARCHITECTURE.md Phase 1).
-- Extends feed_items into the single activity stream: curated (existing admin
-- composer, now audience='global') + automated domain triggers (SECURITY
-- DEFINER, dedupe-keyed, emission in the DB per the scale mandate). Region =
-- zip at write; lat/lng columns ship now for the future bounding-box read.
-- Ranking/affinity is read-time (friendships), never stored.

-- ── schema ──────────────────────────────────────────────────────────────
alter table public.feed_items
  add column if not exists actor_id uuid references public.profiles(id) on delete cascade,
  add column if not exists zip text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists object_kind text,
  add column if not exists object_id uuid,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists audience text not null default 'region';

do $$ begin
  alter table public.feed_items
    add constraint feed_items_audience_check check (audience in ('region','global'));
exception when duplicate_object then null; end $$;

create unique index if not exists feed_items_dedupe_idx on public.feed_items (dedupe_key) where dedupe_key is not null;
create index if not exists feed_items_published_idx on public.feed_items (published_at desc);
create index if not exists feed_items_zip_idx on public.feed_items (zip) where zip is not null;

-- Existing rows are the admin composer's — the global ops lane.
update public.feed_items set audience = 'global' where actor_id is null and audience = 'region';

-- ── emit helper ─────────────────────────────────────────────────────────
create or replace function public.feed_emit(
  p_kind text, p_actor uuid, p_zip text, p_object_kind text, p_object_id uuid,
  p_meta jsonb, p_dedupe text, p_audience text default 'region', p_sport text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.feed_items (kind, body, sport_key, actor_id, zip, object_kind, object_id, meta, dedupe_key, audience, published_at)
  values (p_kind, '', p_sport, p_actor, p_zip, p_object_kind, p_object_id, coalesce(p_meta, '{}'::jsonb), p_dedupe, p_audience, now())
  on conflict (dedupe_key) do nothing;
$$;

-- ── domain emitters ─────────────────────────────────────────────────────
create or replace function public.feed_on_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.home_zip is not null and (tg_op = 'INSERT' or old.home_zip is null) then
    perform public.feed_emit('player_joined', new.id, new.home_zip, 'profile', new.id,
      '{}'::jsonb, 'player_joined:' || new.id, 'region', new.primary_sport);
  end if;
  return null;
end $$;
drop trigger if exists feed_profile on public.profiles;
create trigger feed_profile after insert or update of home_zip on public.profiles
  for each row execute function public.feed_on_profile();

create or replace function public.feed_on_queue_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare z text;
begin
  if new.won then
    select home_zip into z from public.profiles where id = new.user_id;
    if z is not null then
      perform public.feed_emit('match_result', new.user_id, z, 'match', new.match_id,
        jsonb_build_object('points', new.points), 'match_result:' || coalesce(new.match_id::text, new.id::text), 'region', new.sport_key);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists feed_queue_points on public.queue_points;
create trigger feed_queue_points after insert on public.queue_points
  for each row execute function public.feed_on_queue_points();

create or replace function public.feed_on_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare z text;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select home_zip into z from public.profiles where id = new.created_by;
    perform public.feed_emit('event_published', new.created_by, z, 'event', new.id,
      jsonb_build_object('title', new.title, 'starts_at', new.starts_at, 'location', new.location_text, 'event_kind', new.kind),
      'event_published:' || new.id, 'region', new.sport_key);
  end if;
  return null;
end $$;
drop trigger if exists feed_event on public.events;
create trigger feed_event after insert or update of status on public.events
  for each row execute function public.feed_on_event();

create or replace function public.feed_on_tournament()
returns trigger language plpgsql security definer set search_path = public as $$
declare z text;
begin
  if new.visibility = 'public' and (tg_op = 'INSERT' or old.visibility is distinct from 'public') then
    select home_zip into z from public.profiles where id = new.owner_id;
    perform public.feed_emit('tournament_published', new.owner_id, z, 'tournament', new.id,
      jsonb_build_object('title', new.title, 'code', new.code),
      'tournament_published:' || new.id, 'region', null);
  end if;
  return null;
end $$;
drop trigger if exists feed_tournament on public.tournaments;
create trigger feed_tournament after insert or update of visibility on public.tournaments
  for each row execute function public.feed_on_tournament();

create or replace function public.feed_on_listing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.zip is not null then
    perform public.feed_emit('gear_listed', new.listed_by, new.zip, 'listing', new.id,
      jsonb_build_object('title', new.title, 'price_cents', new.price_cents),
      'gear_listed:' || new.id, 'region', null);
  end if;
  return null;
end $$;
drop trigger if exists feed_listing on public.marketplace_listings;
create trigger feed_listing after insert on public.marketplace_listings
  for each row execute function public.feed_on_listing();

create or replace function public.feed_on_provider()
returns trigger language plpgsql security definer set search_path = public as $$
declare z text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select home_zip into z from public.profiles where id = new.user_id;
    perform public.feed_emit('pro_verified', new.user_id, z, 'provider', new.user_id,
      jsonb_build_object('roles', to_jsonb(new.roles)), 'pro_verified:' || new.user_id, 'region', null);
  end if;
  return null;
end $$;
drop trigger if exists feed_provider on public.class_providers;
create trigger feed_provider after insert or update of status on public.class_providers
  for each row execute function public.feed_on_provider();

create or replace function public.feed_on_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare z text;
begin
  z := new.zip;
  if z is null then
    select home_zip into z from public.profiles where id = new.created_by;
  end if;
  if z is not null then
    perform public.feed_emit('team_formed', new.created_by, z, 'team', new.id,
      jsonb_build_object('name', new.name), 'team_formed:' || new.id, 'region', new.sport_key);
  end if;
  return null;
end $$;
drop trigger if exists feed_team on public.teams;
create trigger feed_team after insert on public.teams
  for each row execute function public.feed_on_team();

-- ── retention ───────────────────────────────────────────────────────────
create or replace function public.prune_feed_items()
returns void language sql security definer set search_path = public as $$
  delete from public.feed_items where audience = 'region' and published_at < now() - interval '90 days';
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'klimr-feed-prune') then
    perform cron.schedule('klimr-feed-prune', '20 16 * * *', 'select public.prune_feed_items()');
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;
