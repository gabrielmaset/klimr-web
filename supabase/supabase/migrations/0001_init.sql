-- Klimr — initial schema (Phase 1)
-- PostgreSQL / Supabase. RLS is enabled on every table; policies use auth.uid().
-- Integrity rules baked in at the DB level:
--   * player_sports.points/wins/matches_played: no user UPDATE policy -> only the
--     server (service role, which bypasses RLS) writes them. Users may create
--     their own row with zeroed stats during onboarding.
--   * profiles.verification_status: a trigger preserves the old value unless the
--     caller is the service role -> users cannot self-verify (the admin/approval seam).

-- ---------- enums ----------
create type public.verification_status as enum ('unverified', 'pending', 'verified');
create type public.match_status as enum ('open', 'scheduled', 'completed', 'disputed', 'void');
create type public.result_status as enum ('pending', 'confirmed', 'void');
create type public.join_status as enum ('pending', 'accepted', 'declined', 'waitlisted');
create type public.report_reason as enum ('harassment', 'cheating', 'no_show', 'inappropriate', 'fake_profile', 'other');

-- ---------- reference: sports ----------
create table public.sports (
  key text primary key,
  name text not null,
  skill_system text not null
);

-- ---------- reference: zip -> region lookup (powers the geographic zoom) ----------
create table public.zip_regions (
  zip text primary key,
  neighborhood text not null,
  city text not null,
  state text not null,
  country text not null default 'US'
);

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  home_zip text,
  neighborhood text,
  city text,
  state text,
  country text not null default 'US',
  primary_sport text references public.sports(key),
  verification_status public.verification_status not null default 'unverified',
  reliability int not null default 100 check (reliability between 0 and 100),
  avatar_hue int not null default 200 check (avatar_hue between 0 and 360),
  created_at timestamptz not null default now()
);

-- ---------- player_sports (ranking points per player per sport) ----------
create table public.player_sports (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport_key text not null references public.sports(key),
  points int not null default 0 check (points >= 0),
  skill_rating numeric(4,1),
  matches_played int not null default 0 check (matches_played >= 0),
  wins int not null default 0 check (wins >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, sport_key)
);

-- ---------- matches ----------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  sport_key text not null references public.sports(key),
  format text not null,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz,
  location_text text,
  total_slots int not null default 2 check (total_slots >= 2),
  status public.match_status not null default 'open',
  recurring boolean not null default false,
  result jsonb,
  result_status public.result_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index matches_sport_status_idx on public.matches (sport_key, status);
create index matches_organizer_idx on public.matches (organizer_id);

-- ---------- match_participants ----------
create table public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  side int,
  slot int,
  is_organizer boolean not null default false,
  confirmed boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- ---------- join_requests (open play + waitlist) ----------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status public.join_status not null default 'pending',
  waitlist_position int,
  created_at timestamptz not null default now(),
  unique (match_id, requester_id)
);

-- ---------- blocks ----------
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------- reports ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason public.report_reason not null,
  context text,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

-- ---------- new-user -> profile bootstrap ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- protect verification_status (only the service role may change it) ----------
-- The service role is detected via current_user, which Supabase sets to
-- 'service_role' for both the new sb_secret_... keys and the legacy service_role
-- key. Users (role 'authenticated') therefore cannot change their own status.
-- (The dev seed disables this trigger to set demo statuses.)
create or replace function public.guard_verification_status()
returns trigger language plpgsql as $$
begin
  if new.verification_status is distinct from old.verification_status
     and current_user <> 'service_role' then
    new.verification_status := old.verification_status;
  end if;
  return new;
end; $$;
create trigger guard_verification before update on public.profiles
  for each row execute function public.guard_verification_status();

-- ---------- security-definer helpers (avoid mutually-recursive RLS) ----------
create or replace function public.is_match_organizer(m_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m where m.id = m_id and m.organizer_id = uid);
$$;
create or replace function public.is_match_participant(m_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.match_participants mp where mp.match_id = m_id and mp.user_id = uid);
$$;
create or replace function public.match_is_open(m_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m where m.id = m_id and m.status = 'open');
$$;

-- ---------- ranking read: players ranked within a geographic scope ----------
-- scope in ('zip','neighborhood','city','state','national','world').
-- region is the value at that scope (e.g. scope='city', region='Los Angeles').
create or replace function public.ranked_players(
  p_sport text,
  p_scope text default 'world',
  p_region text default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_hue int,
  verification_status public.verification_status,
  points int,
  skill_rating numeric,
  matches_played int,
  wins int,
  rank bigint
)
language sql stable as $$
  select
    ps.user_id,
    pr.display_name,
    pr.avatar_hue,
    pr.verification_status,
    ps.points,
    ps.skill_rating,
    ps.matches_played,
    ps.wins,
    rank() over (order by ps.points desc)
  from public.player_sports ps
  join public.profiles pr on pr.id = ps.user_id
  where ps.sport_key = p_sport
    and case p_scope
      when 'world' then true
      when 'national' then pr.country is not distinct from coalesce(p_region, pr.country)
      when 'state' then pr.state is not distinct from p_region
      when 'city' then pr.city is not distinct from p_region
      when 'neighborhood' then pr.neighborhood is not distinct from p_region
      when 'zip' then pr.home_zip is not distinct from p_region
      else false
    end
  order by ps.points desc;
$$;

-- ---------- enable RLS ----------
alter table public.sports enable row level security;
alter table public.zip_regions enable row level security;
alter table public.profiles enable row level security;
alter table public.player_sports enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.join_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- ---------- policies ----------
-- reference data: readable by everyone (incl. pre-login onboarding)
create policy "sports are readable" on public.sports for select to anon, authenticated using (true);
create policy "zip_regions are readable" on public.zip_regions for select to anon, authenticated using (true);

-- profiles
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);
create policy "insert own profile unverified" on public.profiles
  for insert to authenticated with check (id = auth.uid() and verification_status = 'unverified');
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- player_sports
create policy "player_sports readable by authenticated" on public.player_sports
  for select to authenticated using (true);
create policy "insert own player_sports zeroed" on public.player_sports
  for insert to authenticated
  with check (user_id = auth.uid() and points = 0 and wins = 0 and matches_played = 0);

-- matches
create policy "matches visible" on public.matches
  for select to authenticated using (
    status = 'open' or organizer_id = auth.uid() or public.is_match_participant(id, auth.uid())
  );
create policy "organizer inserts match" on public.matches
  for insert to authenticated with check (organizer_id = auth.uid());
create policy "organizer updates match" on public.matches
  for update to authenticated using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "organizer deletes match" on public.matches
  for delete to authenticated using (organizer_id = auth.uid());

-- match_participants
create policy "participants visible" on public.match_participants
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_match_organizer(match_id, auth.uid())
    or public.match_is_open(match_id)
  );
create policy "join self as participant" on public.match_participants
  for insert to authenticated with check (user_id = auth.uid());
create policy "confirm own participation" on public.match_participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave own participation" on public.match_participants
  for delete to authenticated using (user_id = auth.uid());

-- join_requests
create policy "join_requests visible" on public.join_requests
  for select to authenticated using (
    requester_id = auth.uid() or public.is_match_organizer(match_id, auth.uid())
  );
create policy "request to join" on public.join_requests
  for insert to authenticated with check (requester_id = auth.uid());
create policy "organizer manages requests" on public.join_requests
  for update to authenticated using (public.is_match_organizer(match_id, auth.uid()));
create policy "cancel own request" on public.join_requests
  for delete to authenticated using (requester_id = auth.uid());

-- blocks
create policy "blocks visible to owner" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "create own block" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy "remove own block" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- reports
create policy "reports visible to reporter" on public.reports
  for select to authenticated using (reporter_id = auth.uid());
create policy "create own report" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ---------- grants (RLS still gates rows; service_role bypasses RLS) ----------
grant usage on schema public to anon, authenticated, service_role;
grant select on public.sports, public.zip_regions to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.player_sports, public.matches, public.match_participants,
  public.join_requests, public.blocks, public.reports
  to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.ranked_players(text, text, text) to anon, authenticated, service_role;
