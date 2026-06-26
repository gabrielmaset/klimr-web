-- =============================================================================
-- Klimr — consolidated schema reference: migrations 0001 through 0040
-- =============================================================================
-- This is a READ-ONLY reference that concatenates migrations 0001–0040 in order,
-- so the whole schema can be reviewed in one place. It is NOT a migration itself:
-- the source of truth remains the individual numbered files in supabase/migrations/.
-- (Later migrations 0041+ are kept separate and are not included here.)
--
-- Every block below is copied verbatim from its source file, in apply order,
-- separated by a banner naming the file it came from.
-- =============================================================================



-- #############################################################################
-- ## SOURCE: supabase/migrations/0001_init.sql
-- #############################################################################

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


-- #############################################################################
-- ## SOURCE: supabase/migrations/0002_accounts_v2.sql
-- #############################################################################

-- ============================================================
-- 0002 — Accounts v2: invite-gated signups + profile wizard fields
-- Run AFTER 0001_init.sql. Safe to run more than once.
-- ============================================================

-- ---------- invite codes ----------
-- RLS is enabled with NO policies on purpose: only the service role and
-- security-definer functions can read or write codes. The public never sees them.
create table if not exists public.invite_codes (
  code text primary key,
  max_uses int not null default 1 check (max_uses >= 1),
  uses int not null default 0 check (uses >= 0),
  note text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.invite_codes enable row level security;

-- Codes must be long enough that guessing is impractical (8–40 chars, uppercase).
alter table public.invite_codes drop constraint if exists invite_codes_code_check;
alter table public.invite_codes drop constraint if exists invite_code_format;
alter table public.invite_codes add constraint invite_code_format
  check (code = upper(code) and length(code) between 8 and 40);

-- ---------- invite code generator ----------
-- Mint hard-to-guess codes like KLIMR-X7QM-K2NF (alphabet drops 0/O, 1/I/L).
-- Run from the SQL editor:  select public.generate_invite_codes(10, 1, 'first testers');
-- Only the database owner / service role may execute it.
create or replace function public.generate_invite_codes(
  p_count int default 1,
  p_max_uses int default 1,
  p_note text default null
) returns setof text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  for i in 1..greatest(p_count, 1) loop
    loop
      v_code := 'KLIMR-'
        || array_to_string(array(
             select substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1)
             from generate_series(1, 4)), '')
        || '-'
        || array_to_string(array(
             select substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1)
             from generate_series(1, 4)), '');
      begin
        insert into public.invite_codes (code, max_uses, note)
        values (v_code, p_max_uses, p_note);
        exit;
      exception when unique_violation then
        null; -- astronomically unlikely collision: roll again
      end;
    end loop;
    return next v_code;
  end loop;
end; $$;

revoke execute on function public.generate_invite_codes(int, int, text) from public;
revoke execute on function public.generate_invite_codes(int, int, text) from anon;
revoke execute on function public.generate_invite_codes(int, int, text) from authenticated;

-- ---------- new profile fields for the wizard ----------
alter table public.profiles
  add column if not exists bio text check (bio is null or length(bio) <= 160),
  add column if not exists gender text check (gender in ('woman','man','nonbinary','prefer_not')),
  add column if not exists birth_year int check (birth_year between 1900 and 2020),
  add column if not exists availability jsonb not null default '[]'::jsonb,
  add column if not exists preferred_format text not null default 'both'
    check (preferred_format in ('singles','doubles','both')),
  add column if not exists play_style text not null default 'both'
    check (play_style in ('social','competitive','both')),
  add column if not exists handedness text check (handedness in ('right','left','either'));

-- Per-sport self-reported level. The numeric skill_rating column from 0001 now
-- carries the player's known external rating (NTRP / DUPR / Handicap, etc.).
alter table public.player_sports
  add column if not exists skill_level text not null default 'casual'
    check (skill_level in ('new','casual','competitive','advanced'));

-- ---------- let players edit their sports — but never their stats ----------
drop policy if exists "update own player_sports" on public.player_sports;
create policy "update own player_sports" on public.player_sports
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.guard_player_stats()
returns trigger language plpgsql as $$
begin
  -- Mirrors guard_verification_status: only the service role may move ranking
  -- stats. skill_level and skill_rating are self-reported and stay editable.
  if current_user <> 'service_role' then
    new.points := old.points;
    new.matches_played := old.matches_played;
    new.wins := old.wins;
  end if;
  return new;
end; $$;

drop trigger if exists guard_player_stats on public.player_sports;
create trigger guard_player_stats
  before update on public.player_sports
  for each row execute function public.guard_player_stats();

-- ---------- invite enforcement at the source ----------
-- Replaces the Phase-1 signup trigger. A new auth user is only created when a
-- valid, unexhausted invite code rides along in the signup metadata — even a
-- direct API call with the public key cannot create an account without one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_hit int;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  update public.invite_codes
     set uses = uses + 1, last_used_at = now()
   where code = v_code and uses < max_uses
   returning 1 into v_hit;
  if v_hit is null then
    raise exception 'invite_required';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0003_invite_code_format.sql
-- #############################################################################

-- ============================================================
-- 0003 — Invite codes v2: anonymous triple-block format
-- Run AFTER 0002_accounts_v2.sql. Safe to run more than once.
-- ============================================================
-- New format: XXXX-XXXX-XXXX (e.g. X7QM-K2NF-B9G3) from a no-lookalike
-- alphabet (no I, L, O, 0 or 1). ~59 bits of randomness, and codes no
-- longer reveal what they belong to.

-- 1) Remove UNUSED codes in the old KLIMR- format — you re-mint below.
--    Codes that were already redeemed stay, as the record of their use.
delete from public.invite_codes
 where uses = 0
   and code !~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$';

-- 2) Only the new format may be created from now on. Existing redeemed
--    rows are grandfathered (NOT VALID skips checking old rows).
alter table public.invite_codes drop constraint if exists invite_code_format;
alter table public.invite_codes add constraint invite_code_format
  check (code ~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$') not valid;

-- 3) The generator now mints the new format.
create or replace function public.generate_invite_codes(
  p_count int default 1,
  p_max_uses int default 1,
  p_note text default null
) returns setof text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  for i in 1..greatest(p_count, 1) loop
    loop
      v_code := '';
      for j in 1..3 loop
        v_code := v_code
          || case when j > 1 then '-' else '' end
          || array_to_string(array(
               select substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1)
               from generate_series(1, 4)), '');
      end loop;
      begin
        insert into public.invite_codes (code, max_uses, note)
        values (v_code, p_max_uses, p_note);
        exit;
      exception when unique_violation then
        null; -- astronomically unlikely collision: roll again
      end;
    end loop;
    return next v_code;
  end loop;
end; $$;

-- 4) Generator stays founder-only (re-asserted; harmless if already set).
revoke execute on function public.generate_invite_codes(int, int, text) from public;
revoke execute on function public.generate_invite_codes(int, int, text) from anon;
revoke execute on function public.generate_invite_codes(int, int, text) from authenticated;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0004_remove_golf.sql
-- #############################################################################

-- ============================================================
-- 0004 — Remove Golf from the catalog (product scope change).
-- Run AFTER 0003. Safe to run more than once.
-- ============================================================

-- 1) Any golf matches go first (players/confirmations/disputes cascade).
delete from public.matches where sport_key = 'golf';

-- 2) Players whose PRIMARY sport was golf get their next sport promoted.
--    Golf-only players end with no primary and are routed back through the
--    profile wizard on their next visit — by design.
update public.profiles p
   set primary_sport = (
     select ps.sport_key
       from public.player_sports ps
      where ps.user_id = p.id and ps.sport_key <> 'golf'
      order by ps.sport_key
      limit 1)
 where p.primary_sport = 'golf';

-- 3) Golf ranking rows, then the sport itself.
delete from public.player_sports where sport_key = 'golf';
delete from public.sports where key = 'golf';


-- #############################################################################
-- ## SOURCE: supabase/migrations/0005_per_sport_play_prefs.sql
-- #############################################################################

-- ============================================================
-- 0005 — Per-sport play preferences
-- Format and racquet hand move from a single profile-level value to one
-- value PER SPORT, since a player may favour singles in one sport and
-- doubles in another (and, rarely, a different hand).
--
-- Run AFTER 0002. Safe to run more than once.
--
-- Security note: player_sports already has an "update own player_sports"
-- policy (0002) plus the guard_player_stats trigger that freezes
-- points / wins / matches_played for non-service callers. These two new
-- columns are NOT touched by that guard, so they stay freely self-editable
-- exactly like skill_level and skill_rating. No policy change required.
-- ============================================================

alter table public.player_sports
  add column if not exists preferred_format text not null default 'both'
    check (preferred_format in ('singles','doubles','both')),
  add column if not exists handedness text
    check (handedness in ('right','left','either'));

-- profiles.preferred_format / handedness (from 0002) are kept as a convenience
-- summary mirror of the PRIMARY sport's values; play_style stays profile-level.


-- #############################################################################
-- ## SOURCE: supabase/migrations/0006_social_feed.sql
-- #############################################################################

-- Klimr — social feed (Phase 3): posts with media, likes, and comments.
--
-- SAFETY MODEL — AI pre-publish moderation:
--   The app classifies post text and media server-side (lib/moderation.ts) BEFORE
--   anything is written, and only the service role may set moderation_status =
--   'approved'. A BEFORE-INSERT trigger forces every non-service-role insert to
--   'pending', and a BEFORE-UPDATE trigger blocks non-service-role status changes,
--   so a client can never bypass the safety gate by writing directly. The feed
--   shows only 'approved' rows (authors can additionally see their own).
--
--   NOTE: an AI classifier is a strong first line, not a complete child-safety
--   solution. Hosting user media in production also calls for hash-matching against
--   known-CSAM databases (PhotoDNA / NCMEC) and a legal reporting path. Treat this
--   as the application-layer gate, not the whole compliance story.

create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'flagged');

-- ---------- posts ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  sport_key text references public.sports(key),
  match_id uuid references public.matches(id) on delete set null,
  moderation_status public.moderation_status not null default 'pending',
  moderation_labels text[],
  created_at timestamptz not null default now()
);
create index posts_approved_idx on public.posts (created_at desc) where moderation_status = 'approved';
create index posts_author_idx on public.posts (author_id);

-- ---------- post media (images now; 'video' reserved for when video moderation lands) ----------
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index post_media_post_idx on public.post_media (post_id);

-- ---------- likes ----------
create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------- comments ----------
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  moderation_status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id) where moderation_status = 'approved';

-- ---------- moderation guards (service role is the only publisher) ----------
create or replace function public.force_moderation_pending()
returns trigger language plpgsql as $$
begin
  if current_user <> 'service_role' then
    new.moderation_status := 'pending';
  end if;
  return new;
end; $$;

create or replace function public.guard_moderation_update()
returns trigger language plpgsql as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and current_user <> 'service_role' then
    new.moderation_status := old.moderation_status;
  end if;
  return new;
end; $$;

create trigger posts_force_pending before insert on public.posts
  for each row execute function public.force_moderation_pending();
create trigger posts_guard_update before update on public.posts
  for each row execute function public.guard_moderation_update();
create trigger post_comments_force_pending before insert on public.post_comments
  for each row execute function public.force_moderation_pending();
create trigger post_comments_guard_update before update on public.post_comments
  for each row execute function public.guard_moderation_update();

-- security-definer helper: avoid recursive RLS when media/likes/comments check posts
create or replace function public.post_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id and (p.moderation_status = 'approved' or p.author_id = auth.uid())
  );
$$;

-- ---------- RLS ----------
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

create policy "posts readable" on public.posts
  for select to authenticated using (moderation_status = 'approved' or author_id = auth.uid());
create policy "insert own post" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "update own post" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete own post" on public.posts
  for delete to authenticated using (author_id = auth.uid());

create policy "post_media readable" on public.post_media
  for select to authenticated using (public.post_visible(post_id));
create policy "insert own post_media" on public.post_media
  for insert to authenticated with check (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );
create policy "delete own post_media" on public.post_media
  for delete to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy "likes readable" on public.post_likes
  for select to authenticated using (true);
create policy "like own" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid() and public.post_visible(post_id));
create policy "unlike own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

create policy "comments readable" on public.post_comments
  for select to authenticated using (
    (moderation_status = 'approved' or author_id = auth.uid()) and public.post_visible(post_id)
  );
create policy "insert own comment" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid() and public.post_visible(post_id));
create policy "delete own comment" on public.post_comments
  for delete to authenticated using (author_id = auth.uid());

-- ---------- grants ----------
grant select, insert, update, delete on
  public.posts, public.post_media, public.post_likes, public.post_comments to authenticated;
grant all on public.posts, public.post_media, public.post_likes, public.post_comments to service_role;
grant execute on function public.post_visible(uuid) to authenticated, service_role;

-- ---------- storage bucket for post media (public read; writes via service role) ----------
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

create policy "post-media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-media');


-- #############################################################################
-- ## SOURCE: supabase/migrations/0007_safety.sql
-- #############################################################################

-- Klimr — child-safety incident ledger + quarantine (Phase 3 safety).
--
-- This is the application-layer scaffolding for known-CSAM handling. It does NOT
-- replace the legal/operational requirements documented in SAFETY.md:
--   * Register as an Electronic Service Provider with NCMEC before launch.
--   * Contract a detection vendor (Thorn Safer) or enable Cloudflare's CSAM
--     Scanning Tool to back the hash-matching webhook (lib/csam-scan.ts).
--   * Under 18 U.S.C. § 2258A: report apparent CSAM to the NCMEC CyberTipline,
--     preserve reported material for 90 days (§ 2258A(h)), and never proliferate
--     or casually view it. Failure to report is itself a federal crime.
--
-- Access model: safety_incidents has RLS enabled with NO policies for anon or
-- authenticated, so ONLY the service role (server-side, via createAdminClient) can
-- read or write it. The quarantine bucket is private (public = false) and has no
-- public-read policy — flagged media is never servable.

create table public.safety_incidents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('csam_hash_match', 'ai_csae_flag', 'user_report')),
  status text not null default 'open' check (status in ('open', 'reported', 'preserved', 'closed')),
  uploader_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  storage_path text,        -- path in the private 'quarantine' bucket
  sha256 text,
  perceptual_hash text,
  provider text,            -- which matcher flagged it (or 'ai')
  match_ref text,           -- opaque reference returned by the matcher
  ai_labels text[],
  detected_at timestamptz not null default now(),
  reported_at timestamptz,  -- when forwarded to NCMEC
  preserved_until timestamptz,
  notes text
);

-- RLS on, but no anon/authenticated policies: locked to the service role only.
alter table public.safety_incidents enable row level security;
revoke all on public.safety_incidents from anon, authenticated;
grant all on public.safety_incidents to service_role;

-- Private quarantine bucket. No public-read policy is created on purpose.
insert into storage.buckets (id, name, public)
values ('quarantine', 'quarantine', false)
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0008_admin.sql
-- #############################################################################

-- Klimr — staff roles + moderation tooling (Phase 3).
--
-- SECURITY MODEL: admin rights are granted ONLY via the database — insert a row into
-- admin_users from the Supabase SQL editor. There is NO in-app path to become an
-- admin or to change your own role. admin_users is locked to the service role; a
-- security-definer function exposes only the CALLER's own role to the app. Admin
-- pages verify the role server-side, then use the service-role client for the broad
-- reads/writes T&S work needs. Every staff action is written to admin_actions.
--
-- Note: CSAM incidents (safety_incidents, migration 0007) are deliberately NOT
-- surfaced in this admin UI. That handling stays in the locked table + SAFETY.md
-- process and must not become a casual review screen.

create table public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('support', 'admin', 'superadmin')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant all on public.admin_users to service_role;

-- The caller's own admin role (or null). Security-definer so it can read the locked
-- table, but it only ever returns the role of auth.uid() — never anyone else's.
create or replace function public.current_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.admin_users where user_id = auth.uid();
$$;
grant execute on function public.current_admin_role() to authenticated, service_role;

-- ---------- audit log ----------
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_ref text,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;
grant all on public.admin_actions to service_role;
create index admin_actions_created_idx on public.admin_actions (created_at desc);

-- ---------- report triage ----------
alter table public.reports add column status text not null default 'open'
  check (status in ('open', 'reviewing', 'actioned', 'dismissed'));
alter table public.reports add column reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.reports add column reviewed_at timestamptz;
alter table public.reports add column resolution text;

-- ---------- account status (suspend / ban) ----------
alter table public.profiles add column account_status text not null default 'active'
  check (account_status in ('active', 'suspended', 'banned'));
alter table public.profiles add column suspended_until timestamptz;

-- A user cannot change their own moderation state; only the service role may.
create or replace function public.guard_account_status()
returns trigger language plpgsql as $$
begin
  if (new.account_status is distinct from old.account_status
      or new.suspended_until is distinct from old.suspended_until)
     and current_user <> 'service_role' then
    new.account_status := old.account_status;
    new.suspended_until := old.suspended_until;
  end if;
  return new;
end; $$;
create trigger guard_account_status before update on public.profiles
  for each row execute function public.guard_account_status();


-- #############################################################################
-- ## SOURCE: supabase/migrations/0009_preferences.sql
-- #############################################################################

-- 0009_preferences.sql — per-user app preferences (notifications + privacy).
-- Idempotent and safe to re-run. RLS: each user reads/writes only their own row.

create table if not exists public.user_preferences (
  user_id                   uuid primary key references public.profiles(id) on delete cascade,
  -- Notifications (delivery turns on as each surface ships; the preference is stored now)
  notif_match_invites       boolean not null default true,
  notif_ranking_changes     boolean not null default true,
  notif_region_challenges   boolean not null default true,
  notif_marketplace_events  boolean not null default true,
  email_digest              text not null default 'weekly' check (email_digest in ('none','daily','weekly')),
  -- Privacy
  profile_visibility        text not null default 'members'       check (profile_visibility in ('public','members')),
  location_precision        text not null default 'neighborhood'  check (location_precision in ('city','neighborhood','zip')),
  who_can_invite            text not null default 'anyone'        check (who_can_invite in ('anyone','verified','nobody')),
  updated_at                timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "prefs read own" on public.user_preferences;
create policy "prefs read own" on public.user_preferences
  for select using (user_id = auth.uid());

drop policy if exists "prefs insert own" on public.user_preferences;
create policy "prefs insert own" on public.user_preferences
  for insert with check (user_id = auth.uid());

drop policy if exists "prefs update own" on public.user_preferences;
create policy "prefs update own" on public.user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());


-- #############################################################################
-- ## SOURCE: supabase/migrations/0010_feed_items.sql
-- #############################################################################

-- 0010_feed_items.sql — system/curated feed (match results, news, announcements).
-- Users do NOT post here yet; only the system (service role) and admins write.
-- Readable by any signed-in user. Idempotent and safe to re-run.

create table if not exists public.feed_items (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'announcement' check (kind in ('announcement','news','result','update')),
  title        text,
  body         text not null,
  sport_key    text references public.sports(key),
  link_url     text,
  link_label   text,
  created_by   uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists feed_items_published_idx on public.feed_items (published_at desc);

alter table public.feed_items enable row level security;

-- Anyone signed in can read published items. Writes are service-role/admin only
-- (no insert/update/delete policies for normal users => RLS denies them).
drop policy if exists "feed read published" on public.feed_items;
create policy "feed read published" on public.feed_items
  for select using (auth.role() = 'authenticated' and published_at <= now());

-- Seed a welcome announcement so the feed isn't empty (fixed id => idempotent).
insert into public.feed_items (id, kind, title, body)
values
  ('00000000-0000-0000-0000-00000000feed', 'announcement', 'Welcome to Klimr',
   'Your local racquet sports ladder is live. Climb your ZIP, then your city, then the world. Match results, news, and product updates will show up right here.')
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0011_chat.sql
-- #############################################################################

-- 0011_chat.sql — end-to-end encrypted, per-match group chat.
-- The server stores only PUBLIC keys, per-recipient WRAPPED keys, and CIPHERTEXT.
-- It never sees private keys or plaintext. Idempotent and safe to re-run.
--
-- Model (matches the phone demo): one conversation per match, group, ephemeral.
-- Crypto: each user has an ECDH P-256 identity keypair (private key lives only in
-- the browser). A random AES-GCM conversation key is wrapped for each member via an
-- ECDH shared secret. Messages are AES-GCM encrypted with the conversation key.

-- ---------- public keys, one row per (user, device) ----------
-- A user can have several devices (phone + web), each with its own keypair.
-- Messages are made readable to every registered device.
create table if not exists public.user_keys (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device_id  text not null,
  public_key text not null,                 -- base64 SPKI of the device's ECDH public key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.user_keys enable row level security;

drop policy if exists "keys readable" on public.user_keys;
create policy "keys readable" on public.user_keys
  for select using (auth.role() = 'authenticated');

drop policy if exists "keys insert own" on public.user_keys;
create policy "keys insert own" on public.user_keys
  for insert with check (user_id = auth.uid());

drop policy if exists "keys update own" on public.user_keys;
create policy "keys update own" on public.user_keys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- helper: is a user a participant of a match? (security definer to avoid RLS recursion) ----------
-- NOTE: this function already exists from 0001 with parameters (m_id, uid). We keep
-- those exact names so CREATE OR REPLACE is a no-op refresh rather than a parameter
-- rename (Postgres rejects renames on replace — error 42P13).
create or replace function public.is_match_participant(m_id uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.match_participants where match_id = m_id and user_id = uid
  );
$$;

-- ---------- conversations (one per match) ----------
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null unique references public.matches(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.conversations enable row level security;

drop policy if exists "conv read if participant" on public.conversations;
create policy "conv read if participant" on public.conversations
  for select using (public.is_match_participant(match_id, auth.uid()));

drop policy if exists "conv insert if participant" on public.conversations;
create policy "conv insert if participant" on public.conversations
  for insert with check (public.is_match_participant(match_id, auth.uid()) and created_by = auth.uid());

-- ---------- helper: is a user a participant of a conversation's match? ----------
create or replace function public.is_conversation_participant(p_conv uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.conversations c
    join public.match_participants mp on mp.match_id = c.match_id
    where c.id = p_conv and mp.user_id = p_user
  );
$$;

-- ---------- conversation key, wrapped once per recipient DEVICE ----------
-- Each of a user's devices can unwrap it. wrapped_by/_device identify whose device
-- public key was used for the ECDH, so the recipient derives against the right key.
create table if not exists public.conversation_keys (
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  recipient_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_device  text not null,
  wrapped_key       text not null,
  iv                text not null,
  wrapped_by        uuid not null references public.profiles(id) on delete cascade,
  wrapped_by_device text not null,
  created_at        timestamptz not null default now(),
  primary key (conversation_id, recipient_id, recipient_device)
);
alter table public.conversation_keys enable row level security;

-- A participant can read all key rows for a conversation they're in (each row is
-- only decryptable by its own recipient anyway).
drop policy if exists "convkey read if participant" on public.conversation_keys;
create policy "convkey read if participant" on public.conversation_keys
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

-- A participant may wrap the key for any co-participant (key distribution / self-heal).
drop policy if exists "convkey insert" on public.conversation_keys;
create policy "convkey insert" on public.conversation_keys
  for insert with check (
    wrapped_by = auth.uid()
    and public.is_conversation_participant(conversation_id, auth.uid())
    and public.is_conversation_participant(conversation_id, recipient_id)
  );

drop policy if exists "convkey update" on public.conversation_keys;
create policy "convkey update" on public.conversation_keys
  for update using (public.is_conversation_participant(conversation_id, auth.uid()))
  with check (wrapped_by = auth.uid());

-- ---------- ciphertext messages ----------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  ciphertext      text not null,
  iv              text not null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);
alter table public.messages enable row level security;

drop policy if exists "msg read if participant" on public.messages;
create policy "msg read if participant" on public.messages
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "msg insert own" on public.messages;
create policy "msg insert own" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_conversation_participant(conversation_id, auth.uid())
  );


-- #############################################################################
-- ## SOURCE: supabase/migrations/0012_sponsorships.sql
-- #############################################################################

-- 0012_sponsorships.sql — local businesses sponsoring top-ranked amateur players.
-- Sponsors are public. A player sees their own sponsorships/offers and can accept
-- or decline offers. Offers are created by admins/businesses (service role).
-- Idempotent and safe to re-run.

create table if not exists public.sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  hue        integer not null default 18,
  type       text not null default 'Equipment Partner',
  location   text,
  tagline    text,
  about      text,
  perks      text[] not null default '{}',
  products   jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;

drop policy if exists "sponsors readable" on public.sponsors;
create policy "sponsors readable" on public.sponsors
  for select using (auth.role() = 'authenticated');

create table if not exists public.player_sponsorships (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.profiles(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  status     text not null default 'offered' check (status in ('offered','active','declined','ended')),
  category   text not null default 'Equipment',
  term       text not null default '12-month term · cancel anytime',
  started_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists player_sponsorships_player_idx on public.player_sponsorships (player_id);
alter table public.player_sponsorships enable row level security;

drop policy if exists "sponsorship read own" on public.player_sponsorships;
create policy "sponsorship read own" on public.player_sponsorships
  for select using (player_id = auth.uid());

-- Players accept/decline their own offers; offers themselves are created server-side.
drop policy if exists "sponsorship update own" on public.player_sponsorships;
create policy "sponsorship update own" on public.player_sponsorships
  for update using (player_id = auth.uid()) with check (player_id = auth.uid());

-- Seed a few local sponsors so the directory has content.
insert into public.sponsors (id, name, hue, type, location, tagline, about, perks, products) values
  ('00000000-0000-0000-0000-0000000005b1', 'Mar Vista Pro Shop', 18, 'Equipment Partner', 'Mar Vista · 90066',
   'Local racquet sports specialists since 2019',
   'An independent pro shop serving the Westside racquet community with stringing, demos, and gear.',
   array['Free monthly stringing', '15% off all gear', 'Featured in the shop window'],
   '[{"name":"Racquet stringing","price":"$25"},{"name":"Grip replacement","price":"$8"},{"name":"Weekly demo racquet","price":"$15"}]'::jsonb),
  ('00000000-0000-0000-0000-0000000005b2', 'Westside Tennis Co.', 8, 'Apparel Partner', 'Santa Monica · 90404',
   'Performance apparel for the local game',
   'A Westside apparel label outfitting top-ranked neighborhood players.',
   array['Seasonal apparel kit', '20% off the online store', 'Co-branded match shirt'],
   '[{"name":"Match polo","price":"$48"},{"name":"Performance shorts","price":"$38"}]'::jsonb),
  ('00000000-0000-0000-0000-0000000005b3', 'Bay Cities Padel Club', 45, 'Club Partner', 'Culver City · 90232',
   'Where the Westside plays padel',
   'A premier padel facility offering court time and coaching to sponsored locals.',
   array['4 free court hours / month', 'Priority booking', 'Two guest passes'],
   '[{"name":"Court hour","price":"$40"},{"name":"Group clinic","price":"$30"}]'::jsonb)
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0013_notifications.sql
-- #############################################################################

-- 0013_notifications.sql — per-user in-app notifications.
-- System/service writes them; users read and mark their own as read. Idempotent.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'system'
             check (kind in ('match_invite','match_join','match_confirm','ranking','region_challenge','marketplace','sponsorship','system')),
  title      text not null,
  body       text,
  link_url   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notif read own" on public.notifications;
create policy "notif read own" on public.notifications
  for select using (user_id = auth.uid());

-- Users may mark their own notifications as read (no inserts; system writes via service role).
drop policy if exists "notif update own" on public.notifications;
create policy "notif update own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());


-- #############################################################################
-- ## SOURCE: supabase/migrations/0014_teams.sql
-- #############################################################################

-- 0014_teams.sql — player teams (e.g. a local crew or club squad for a sport),
-- membership, and invitations. Idempotent.
--
-- Reads: team + roster info is visible to any signed-in user. Writes to membership
-- happen through server actions (service role) after validation; users can leave
-- (delete own membership) and respond to their own invites.

create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sport_key    text not null references public.sports(key),
  city         text,
  neighborhood text,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.teams enable row level security;

drop policy if exists "teams readable" on public.teams;
create policy "teams readable" on public.teams
  for select using (auth.role() = 'authenticated');

drop policy if exists "teams insert own" on public.teams;
create policy "teams insert own" on public.teams
  for insert with check (created_by = auth.uid());

drop policy if exists "teams update captain" on public.teams;
create policy "teams update captain" on public.teams
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "teams delete captain" on public.teams;
create policy "teams delete captain" on public.teams
  for delete using (created_by = auth.uid());

create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members (user_id);
alter table public.team_members enable row level security;

drop policy if exists "members readable" on public.team_members;
create policy "members readable" on public.team_members
  for select using (auth.role() = 'authenticated');

-- A player can leave (delete their own row). Adds/removes-by-captain go via service role.
drop policy if exists "members leave own" on public.team_members;
create policy "members leave own" on public.team_members
  for delete using (user_id = auth.uid());

create table if not exists public.team_invites (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (team_id, invited_user_id)
);
create index if not exists team_invites_invited_idx on public.team_invites (invited_user_id);
alter table public.team_invites enable row level security;

-- The invited player and the inviter can see an invite.
drop policy if exists "invites readable" on public.team_invites;
create policy "invites readable" on public.team_invites
  for select using (invited_user_id = auth.uid() or invited_by = auth.uid());

-- The invited player accepts/declines their own invite. Creation goes via service role.
drop policy if exists "invites respond" on public.team_invites;
create policy "invites respond" on public.team_invites
  for update using (invited_user_id = auth.uid()) with check (invited_user_id = auth.uid());


-- #############################################################################
-- ## SOURCE: supabase/migrations/0015_courts.sql
-- #############################################################################

-- 0015_courts.sql — court/venue directory and community reviews. Idempotent.
-- Court info is readable by signed-in users; reviews are written by members and
-- screened by the app before insert. Seeds a few Westside LA courts.

create table if not exists public.courts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sports       text[] not null default '{}',
  address      text,
  neighborhood text,
  city         text,
  state        text,
  zip          text,
  lat          double precision,
  lng          double precision,
  amenities    text[] not null default '{}',
  created_at   timestamptz not null default now()
);
alter table public.courts enable row level security;

drop policy if exists "courts readable" on public.courts;
create policy "courts readable" on public.courts
  for select using (auth.role() = 'authenticated');

create table if not exists public.court_reviews (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text,
  created_at timestamptz not null default now(),
  unique (court_id, author_id)
);
create index if not exists court_reviews_court_idx on public.court_reviews (court_id, created_at desc);
alter table public.court_reviews enable row level security;

drop policy if exists "reviews readable" on public.court_reviews;
create policy "reviews readable" on public.court_reviews
  for select using (auth.role() = 'authenticated');

drop policy if exists "reviews insert own" on public.court_reviews;
create policy "reviews insert own" on public.court_reviews
  for insert with check (author_id = auth.uid());

drop policy if exists "reviews update own" on public.court_reviews;
create policy "reviews update own" on public.court_reviews
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "reviews delete own" on public.court_reviews;
create policy "reviews delete own" on public.court_reviews
  for delete using (author_id = auth.uid());

-- Seed Westside courts (approximate coordinates; fixed ids => idempotent).
insert into public.courts (id, name, sports, address, neighborhood, city, state, zip, lat, lng, amenities) values
  ('00000000-0000-0000-0000-00000000c0a1', 'Mar Vista Recreation Center', array['tennis','pickleball'], '11430 Woodbine St', 'Mar Vista', 'Los Angeles', 'CA', '90066', 34.0119, -118.4309, array['Lighted courts','Restrooms','Free parking','Water fountain']),
  ('00000000-0000-0000-0000-00000000c0a2', 'Stoner Recreation Center', array['tennis','pickleball','racquetball'], '1835 Stoner Ave', 'West LA', 'Los Angeles', 'CA', '90025', 34.0386, -118.4490, array['Lighted courts','Restrooms','Pro shop nearby']),
  ('00000000-0000-0000-0000-00000000c0a3', 'Penmar Recreation Center', array['tennis'], '1341 Lake St', 'Venice', 'Los Angeles', 'CA', '90291', 33.9967, -118.4561, array['Lighted courts','Backboard','Free parking']),
  ('00000000-0000-0000-0000-00000000c0a4', 'Memorial Park', array['tennis'], '1401 Olympic Blvd', 'Santa Monica', 'Santa Monica', 'CA', '90404', 34.0186, -118.4789, array['Lighted courts','Restrooms','Reservations']),
  ('00000000-0000-0000-0000-00000000c0a5', 'Bay Cities Padel Club', array['padel'], 'Hayden Ave', 'Culver City', 'Culver City', 'CA', '90232', 34.0264, -118.3850, array['Indoor courts','Pro shop','Coaching','Reservations']),
  ('00000000-0000-0000-0000-00000000c0a6', 'Westwood Recreation Center', array['tennis','pickleball'], '1350 Sepulveda Blvd', 'Westwood', 'Los Angeles', 'CA', '90025', 34.0489, -118.4399, array['Lighted courts','Restrooms','Free parking'])
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0016_region_challenges.sql
-- #############################################################################

-- 0016_region_challenges.sql — neighborhood-vs-neighborhood (or city-vs-city)
-- competition for a sport. Standings are computed live from profiles + player_sports,
-- so this table only defines the matchup. Idempotent. Curated (service/admin) writes.

create table if not exists public.region_challenges (
  id         uuid primary key default gen_random_uuid(),
  sport_key  text not null references public.sports(key),
  scope      text not null default 'neighborhood' check (scope in ('neighborhood','city')),
  region_a   text not null,
  region_b   text not null,
  status     text not null default 'active' check (status in ('active','ended')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.region_challenges enable row level security;

drop policy if exists "challenges readable" on public.region_challenges;
create policy "challenges readable" on public.region_challenges
  for select using (auth.role() = 'authenticated');

-- Seed showcase challenges (fixed ids => idempotent).
insert into public.region_challenges (id, sport_key, scope, region_a, region_b, ends_at) values
  ('00000000-0000-0000-0000-00000000d0a1', 'tennis',     'neighborhood', 'Mar Vista',    'Santa Monica', now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000000d0a2', 'pickleball', 'neighborhood', 'Mar Vista',    'Venice',       now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000000d0a3', 'tennis',     'neighborhood', 'Santa Monica', 'Westwood',     now() + interval '30 days')
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0017_events.sql
-- #############################################################################

-- 0017_events.sql — local events (open play, ladder nights, clinics, tournaments,
-- socials) and RSVPs. Idempotent. Event creation is curated (service/admin); any
-- member can RSVP / cancel their own RSVP.

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  sport_key     text not null references public.sports(key),
  kind          text not null default 'open_play' check (kind in ('open_play','ladder','clinic','tournament','social')),
  description   text,
  court_id      uuid references public.courts(id) on delete set null,
  location_text text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  capacity      int,
  cost_text     text,
  status        text not null default 'active' check (status in ('active','cancelled')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);
alter table public.events enable row level security;

drop policy if exists "events readable" on public.events;
create policy "events readable" on public.events
  for select using (auth.role() = 'authenticated');

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_user_idx on public.event_rsvps (user_id);
alter table public.event_rsvps enable row level security;

drop policy if exists "rsvps readable" on public.event_rsvps;
create policy "rsvps readable" on public.event_rsvps
  for select using (auth.role() = 'authenticated');

drop policy if exists "rsvps insert own" on public.event_rsvps;
create policy "rsvps insert own" on public.event_rsvps
  for insert with check (user_id = auth.uid());

drop policy if exists "rsvps delete own" on public.event_rsvps;
create policy "rsvps delete own" on public.event_rsvps
  for delete using (user_id = auth.uid());

-- Seed upcoming events at seeded courts (relative dates => always upcoming on run).
insert into public.events (id, title, sport_key, kind, description, court_id, starts_at, ends_at, capacity, cost_text) values
  ('00000000-0000-0000-0000-00000000e0a1', 'Saturday Pickleball Open Play', 'pickleball', 'open_play',
   'Drop-in rotating doubles for all levels. Paddles to share if you''re new.',
   '00000000-0000-0000-0000-00000000c0a1', now() + interval '3 days' + interval '9 hours', now() + interval '3 days' + interval '12 hours', 16, 'Free'),
  ('00000000-0000-0000-0000-00000000e0a2', 'Tuesday Tennis Ladder Night', 'tennis', 'ladder',
   'Weekly ladder matches. Win to climb. Bring a can of balls.',
   '00000000-0000-0000-0000-00000000c0a2', now() + interval '5 days' + interval '18 hours', now() + interval '5 days' + interval '21 hours', 24, 'Free'),
  ('00000000-0000-0000-0000-00000000e0a3', 'Beginner Padel Clinic', 'padel', 'clinic',
   'Intro clinic covering serves, the glass, and positioning. Loaner racquets provided.',
   '00000000-0000-0000-0000-00000000c0a5', now() + interval '7 days' + interval '10 hours', now() + interval '7 days' + interval '11 hours' + interval '30 minutes', 8, '$15 drop-in'),
  ('00000000-0000-0000-0000-00000000e0a4', 'Westside Tennis Round-Robin', 'tennis', 'tournament',
   'Friendly round-robin, prizes for the top two. Singles, intermediate and up.',
   '00000000-0000-0000-0000-00000000c0a4', now() + interval '10 days' + interval '9 hours', now() + interval '10 days' + interval '13 hours', 16, 'Free')
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0018_marketplace.sql
-- #############################################################################

-- 0018_marketplace.sql — coaching & gear listings players can browse and then
-- contact the lister directly. No payments are processed on Klimr and listings are
-- text-only (no uploads) for now; curated (service/admin) writes. Idempotent.

create table if not exists public.marketplace_listings (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('coaching','gear')),
  title         text not null,
  sport_key     text references public.sports(key),
  category      text,                 -- gear: racquet/paddle/bag/shoes/balls/accessory · coaching: focus
  price_text    text,                 -- informational only; no payments processed on Klimr
  condition     text,                 -- gear only: new / like_new / good / fair
  location      text,
  description   text,
  contact_email text,
  listed_by     uuid references public.profiles(id) on delete set null,
  status        text not null default 'active' check (status in ('active','closed')),
  created_at    timestamptz not null default now()
);
create index if not exists marketplace_kind_idx on public.marketplace_listings (kind, created_at desc);
alter table public.marketplace_listings enable row level security;

drop policy if exists "listings readable" on public.marketplace_listings;
create policy "listings readable" on public.marketplace_listings
  for select using (auth.role() = 'authenticated');

-- Seed listings (fixed ids => idempotent).
insert into public.marketplace_listings (id, kind, title, sport_key, category, price_text, condition, location, description, contact_email) values
  ('00000000-0000-0000-0000-00000000f0a1', 'coaching', 'Private Tennis Lessons — USPTA Certified', 'tennis', 'All levels', '$70/hr', null, 'Mar Vista',
   'Stroke production, strategy, and match play for beginners through 4.5. Flexible weekday mornings and weekends.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0a2', 'coaching', 'Pickleball Fundamentals Coaching', 'pickleball', 'Beginner / Intermediate', '$45/hr', null, 'Santa Monica',
   'Dinking, third-shot drops, and kitchen positioning. Group rates available for 2–4 players.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0a3', 'coaching', 'Padel Technique Sessions', 'padel', 'All levels', '$60/hr', null, 'Culver City',
   'Learn the walls, the bandeja, and smart court positioning from a former club pro.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b1', 'gear', 'Babolat Pure Drive 2024', 'tennis', 'racquet', '$120', 'like_new', 'Venice',
   'Grip 3 (4 3/8), strung with Babolat RPM Blast. Barely used, no scratches. Comes with cover.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b2', 'gear', 'Selkirk Amped Pickleball Paddle', 'pickleball', 'paddle', '$60', 'good', 'Mar Vista',
   'Midweight, great control. Some cosmetic wear on the edge guard but plays perfectly.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b3', 'gear', 'Wilson 6-Racquet Tennis Bag', 'tennis', 'bag', '$40', 'good', 'West LA',
   'Thermal main compartment, separate shoe pocket. Plenty of life left.', 'hello@klimr.com'),
  ('00000000-0000-0000-0000-00000000f0b4', 'gear', 'Head Padel Racquet (Diadema shape)', 'padel', 'racquet', '$80', 'like_new', 'Culver City',
   'Carbon face, soft EVA core. Ideal for control players. Includes wrist strap.', 'hello@klimr.com')
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0019_marketplace_upgrade.sql
-- #############################################################################

-- 0019_marketplace_upgrade.sql — adds a sortable numeric price and a save/watchlist.
-- Idempotent. price_text stays the display value; price_cents drives sorting.

alter table public.marketplace_listings add column if not exists price_cents int;

-- Backfill seeded listings' numeric price (coaching = hourly rate).
update public.marketplace_listings set price_cents = 7000  where id = '00000000-0000-0000-0000-00000000f0a1' and price_cents is null;
update public.marketplace_listings set price_cents = 4500  where id = '00000000-0000-0000-0000-00000000f0a2' and price_cents is null;
update public.marketplace_listings set price_cents = 6000  where id = '00000000-0000-0000-0000-00000000f0a3' and price_cents is null;
update public.marketplace_listings set price_cents = 12000 where id = '00000000-0000-0000-0000-00000000f0b1' and price_cents is null;
update public.marketplace_listings set price_cents = 6000  where id = '00000000-0000-0000-0000-00000000f0b2' and price_cents is null;
update public.marketplace_listings set price_cents = 4000  where id = '00000000-0000-0000-0000-00000000f0b3' and price_cents is null;
update public.marketplace_listings set price_cents = 8000  where id = '00000000-0000-0000-0000-00000000f0b4' and price_cents is null;

create table if not exists public.saved_listings (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index if not exists saved_listings_user_idx on public.saved_listings (user_id, created_at desc);
alter table public.saved_listings enable row level security;

drop policy if exists "saved read own" on public.saved_listings;
create policy "saved read own" on public.saved_listings
  for select using (user_id = auth.uid());

drop policy if exists "saved insert own" on public.saved_listings;
create policy "saved insert own" on public.saved_listings
  for insert with check (user_id = auth.uid());

drop policy if exists "saved delete own" on public.saved_listings;
create policy "saved delete own" on public.saved_listings
  for delete using (user_id = auth.uid());


-- #############################################################################
-- ## SOURCE: supabase/migrations/0020_invite_owner.sql
-- #############################################################################

-- 0020_invite_owner.sql — let members own a personal invite code they can share.
-- Admin/batch codes keep owner_id NULL. Idempotent. RLS is already enabled on the
-- table (0002); the signup trigger is SECURITY DEFINER so it still works.

alter table public.invite_codes add column if not exists owner_id uuid references public.profiles(id) on delete set null;
create index if not exists invite_codes_owner_idx on public.invite_codes (owner_id);

-- A signed-in user may read the codes they own (for the Invite screen).
-- Codes are still minted server-side via the service role; there is no user insert policy.
drop policy if exists "own invite codes readable" on public.invite_codes;
create policy "own invite codes readable" on public.invite_codes
  for select using (owner_id = auth.uid());


-- #############################################################################
-- ## SOURCE: supabase/migrations/0021_investor_codes.sql
-- #############################################################################

-- 0021_investor_codes.sql
-- Access codes for the INVESTOR demo gate (investor.klimr.com / the footer link).
-- You create these exactly like invite codes, but they live in their own table so
-- an investor code can never be used to sign up, and a member invite can never
-- unlock the investor demo. The gate validates a code server-side via the
-- service-role client; RLS locks this table to everyone else.

create table if not exists public.investor_codes (
  code         text primary key
                 check (code = upper(code) and char_length(code) between 8 and 40),
  label        text,
  active       boolean not null default true,
  -- Investor codes expire 7 days after they're minted. The gate also enforces
  -- this at entry; change the interval here if you want a different window.
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.investor_codes enable row level security;
-- No policies on purpose: only the server-side gate action (service-role client)
-- may read or write this table. anon / authenticated get nothing.
revoke all on public.investor_codes from anon, authenticated;
grant all on public.investor_codes to service_role;

-- Mint codes from the Supabase SQL editor, e.g.:
--   select * from public.generate_investor_codes(5, 'seed round');
-- Returns the freshly-created codes. Format: INV-XXXX-XXXX (unambiguous chars).
-- Each code is valid for 7 days from creation (expires_at default above).
-- Deactivate one early with: update public.investor_codes set active=false where code='INV-....';
create or replace function public.generate_investor_codes(p_count int, p_note text default null)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
begin
  for i in 1..greatest(p_count, 1) loop
    loop
      v_code := 'INV-';
      for k in 1..4 loop
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      v_code := v_code || '-';
      for k in 1..4 loop
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.investor_codes where code = v_code);
    end loop;
    insert into public.investor_codes (code, label) values (v_code, p_note);
    return next v_code;
  end loop;
end;
$$;

-- The minting function is privileged; keep it out of client-reachable roles.
revoke all on function public.generate_investor_codes(int, text) from public, anon, authenticated;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0022_harden_functions.sql
-- #############################################################################

-- 0022_harden_functions.sql
-- Clears the Security Advisor's "Function Search Path Mutable" warnings by pinning
-- a fixed search_path on the functions that were missing it, and revokes EXECUTE on
-- the new-user trigger (it's fired by the auth.users trigger, never called directly).
-- No behavioral change. Safe to run once.

-- Pin search_path (the trigger guards + the ranking function were missing it).
alter function public.force_moderation_pending()      set search_path = public;
alter function public.guard_moderation_update()        set search_path = public;
alter function public.guard_verification_status()      set search_path = public;
alter function public.guard_account_status()           set search_path = public;
alter function public.guard_player_stats()             set search_path = public;
alter function public.ranked_players(text, text, text) set search_path = public;

-- handle_new_user runs only as the auth.users INSERT trigger (it executes with the
-- definer's rights regardless of grants), so nothing should be able to call it
-- directly. Revoking EXECUTE clears its "can execute" warnings with zero impact.
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0023_investor_code_format.sql
-- #############################################################################

-- ============================================================
-- 0023 — Investor codes: match the invite-code format
-- Run AFTER 0021_investor_codes.sql. Safe to run more than once.
-- ============================================================
-- Investor codes were minted as INV-XXXX-XXXX. The prefix gave away that a
-- code was an investor code, which we don't want. This switches them to the
-- SAME anonymous format as invite codes: XXXX-XXXX-XXXX (three 4-char blocks,
-- no prefix), from the same no-lookalike alphabet (no I, L, O, 0 or 1).
--
-- The investor_codes `code` check (uppercase, length 8–40) already permits the
-- new 14-char format, so no constraint change is needed.

-- 1) Clear UNUSED codes still in the old INV- format — you re-mint below.
--    Any already-redeemed code (last_used_at set) is left as a record of use.
delete from public.investor_codes
 where code like 'INV-%'
   and last_used_at is null;

-- 2) Redefine the generator to mint the invite-style format.
create or replace function public.generate_investor_codes(p_count int, p_note text default null)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- same as invite codes; no I/L/O/0/1
  v_code text;
begin
  for i in 1..greatest(p_count, 1) loop
    loop
      v_code := '';
      for j in 1..3 loop
        v_code := v_code
          || case when j > 1 then '-' else '' end
          || array_to_string(array(
               select substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1)
               from generate_series(1, 4)), '');
      end loop;
      begin
        insert into public.investor_codes (code, label) values (v_code, p_note);
        exit;
      exception when unique_violation then
        null; -- astronomically unlikely collision: roll again
      end;
    end loop;
    return next v_code;
  end loop;
end;
$$;

-- 3) Keep the minting function privileged (re-asserted; harmless if already set).
revoke all on function public.generate_investor_codes(int, text) from public, anon, authenticated;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0024_investor_code_first_use_expiry.sql
-- #############################################################################

-- 0024 — Investor codes: start the 7-day clock at FIRST USE, not at creation.
--
-- Before: expires_at defaulted to now() + 7 days the moment a code was minted,
-- so a code you generated today silently died in a week even if no investor
-- ever opened it. After: expires_at stays NULL until the first successful
-- entry; enterInvestor() then stamps now() + 7 days. An unused code waits
-- indefinitely, then runs for exactly one week from when someone first uses it.
--
-- MUST ship together with the matching enterInvestor() change — on its own this
-- leaves every code with a null expiry, which the old action read as "expired".

alter table public.investor_codes
  alter column expires_at drop default,
  alter column expires_at drop not null;

-- Reset existing codes into the first-use model.

-- Never opened yet → clock hasn't started.
update public.investor_codes
   set expires_at = null
 where last_used_at is null;

-- Already used → run their week from when they were first entered. We only
-- track last_used_at, which equals first use for codes used a single time.
update public.investor_codes
   set expires_at = last_used_at + interval '7 days'
 where last_used_at is not null;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0025_redeem_investor_code_function.sql
-- #############################################################################

-- 0025 — redeem_investor_code(): the investor gate's single, least-privilege
-- entry point. The klimr-investor doorman (Cloudflare Worker) calls it with the
-- public anon key to validate a code and open the portal.
--
-- It validates a code and, on the FIRST successful use, starts the 7-day clock
-- (this is where the old enterInvestor server action's logic now lives, so the
-- gate's brain is in one place — the database). SECURITY DEFINER lets it read
-- and stamp investor_codes despite RLS, while anon is granted EXECUTE on this
-- ONE function and nothing else — no other access to the table or the database.
--
-- Returns: {"valid": false}
--      or  {"valid": true, "expires_at": "<timestamptz>"}
--
-- Requires 0024 (nullable expires_at) to have run first.

create or replace function public.redeem_investor_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code        text := upper(trim(p_code));
  v_active      boolean;
  v_expires_at  timestamptz;
  v_now         timestamptz := now();
begin
  select active, expires_at
    into v_active, v_expires_at
    from public.investor_codes
   where code = v_code;

  -- Unknown or disabled code.
  if not found or v_active is not true then
    return jsonb_build_object('valid', false);
  end if;

  -- Clock has started and run out.
  if v_expires_at is not null and v_expires_at <= v_now then
    return jsonb_build_object('valid', false);
  end if;

  if v_expires_at is null then
    -- First use: start the 7-day window now.
    v_expires_at := v_now + interval '7 days';
    update public.investor_codes
       set expires_at = v_expires_at,
           last_used_at = v_now
     where code = v_code;
  else
    -- Subsequent use within the window: just record it.
    update public.investor_codes
       set last_used_at = v_now
     where code = v_code;
  end if;

  return jsonb_build_object('valid', true, 'expires_at', v_expires_at);
end;
$$;

-- Least privilege: only the anon role (the Worker's key) may call this, nothing else.
revoke all on function public.redeem_investor_code(text) from public;
grant execute on function public.redeem_investor_code(text) to anon;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0026_admin_code_management.sql
-- #############################################################################

-- 0026 — admin code management.
--
-- 1) Invite codes gain an on/off switch (investor_codes already has `active`),
--    so the admin can DISABLE a code without deleting it. The gate, the signup
--    pre-check, and the signup trigger all refuse a disabled code.
-- 2) Record which invite code each new member signed up with, surfaced on their
--    admin record.
-- 3) Let the service role (the admin server actions) call the code generators.

-- 1) on/off switch for invite codes
alter table public.invite_codes
  add column if not exists active boolean not null default true;

-- 2) the invite code a member used at signup
alter table public.profiles
  add column if not exists signup_code text;

-- Recreate the signup trigger: refuse disabled codes, and stamp signup_code.
-- (Body matches 0002 with `and active` added to the consume and signup_code added
--  to the profile insert; 0022's execute-revoke is preserved by create-or-replace.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_hit int;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  update public.invite_codes
     set uses = uses + 1, last_used_at = now()
   where code = v_code and uses < max_uses and active
   returning 1 into v_hit;
  if v_hit is null then
    raise exception 'invite_required';
  end if;

  insert into public.profiles (id, display_name, signup_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    nullif(v_code, '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3) the admin server actions (service role) call these via rpc to mint codes.
grant execute on function public.generate_invite_codes(int, int, text) to service_role;
grant execute on function public.generate_investor_codes(int, text) to service_role;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0027_archive_purge_chat_reads.sql
-- #############################################################################

-- 0027: account archive + 30-day purge, and chat read state.
--
-- Prereq: pg_cron must be available. If `create extension` below errors, enable
-- it once in the dashboard (Database → Extensions → search "pg_cron" → enable),
-- then re-run this migration.

-- ============================================================
-- 1) Archive (soft delete)
-- ============================================================
-- Admin "delete" archives instead of hard-deleting: the account is hidden and
-- recoverable for 30 days, then purged (below). Allow the 'archived' state and
-- record when it happened. The existing guard_account_status trigger still only
-- lets the service role change account_status, so this is admin-only.
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'suspended', 'banned', 'archived'));

alter table public.profiles add column if not exists archived_at timestamptz;

-- ============================================================
-- 2) Scheduled purge (pg_cron)
-- ============================================================
-- Hard-deletes accounts archived more than 30 days ago. Deleting the auth user
-- cascades through every table that references profiles(id) on delete cascade
-- (and the auth.* tables), so this single statement fully removes the account.
-- The admin_actions audit log is preserved (its actor/target are set null).
create extension if not exists pg_cron;

create or replace function public.purge_archived_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  with gone as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id
      and p.account_status = 'archived'
      and p.archived_at is not null
      and p.archived_at < now() - interval '30 days'
    returning u.id
  )
  select count(*) into purged from gone;
  return purged;
end;
$$;

revoke all on function public.purge_archived_accounts() from public, anon, authenticated;

-- Nightly at 03:30 UTC. Scheduling with an existing name updates the job.
select cron.schedule('purge-archived-accounts', '30 3 * * *', $$select public.purge_archived_accounts();$$);

-- ============================================================
-- 3) Chat read state (powers the Chats unread bubble)
-- ============================================================
create table if not exists public.conversation_reads (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.conversation_reads enable row level security;

drop policy if exists "reads own select" on public.conversation_reads;
create policy "reads own select" on public.conversation_reads
  for select using (user_id = auth.uid());

drop policy if exists "reads own insert" on public.conversation_reads;
create policy "reads own insert" on public.conversation_reads
  for insert with check (
    user_id = auth.uid() and public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "reads own update" on public.conversation_reads;
create policy "reads own update" on public.conversation_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Count of the caller's conversations that have a message they haven't seen
-- (newer than their last read, not sent by them), among still-active threads.
create or replace function public.chat_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.conversations c
  join public.match_participants mp
    on mp.match_id = c.match_id and mp.user_id = auth.uid()
  where (c.expires_at is null or c.expires_at > now())
    and exists (
      select 1 from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.conversation_reads r
            where r.user_id = auth.uid() and r.conversation_id = c.id),
          '-infinity'::timestamptz
        )
    );
$$;

revoke all on function public.chat_unread_count() from public, anon;
grant execute on function public.chat_unread_count() to authenticated;

-- ============================================================
-- 4) Keep archived accounts out of public leaderboards
-- ============================================================
-- Recreate ranked_players with an archived filter (preserving the 0022 search_path
-- hardening). Suspended/banned standings still show; only archived (pending
-- deletion) accounts are removed from the boards.
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
language sql stable
set search_path = public
as $$
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
    and pr.account_status <> 'archived'
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


-- #############################################################################
-- ## SOURCE: supabase/migrations/0028_courts_seed_expansion.sql
-- #############################################################################

-- 0028_courts_seed_expansion.sql — additional real Westside courts. Idempotent.
-- Extends the 6 courts seeded in 0015 with padel clubs, more pickleball, and a
-- Mar Vista racquetball/tennis spot so all four sports are represented on the map.
-- Fixed ids => safe to re-run.

insert into public.courts (id, name, sports, address, neighborhood, city, state, zip, lat, lng, amenities) values
  ('00000000-0000-0000-0000-00000000c0a7', 'Los Angeles Padel Club', array['padel'], '3801 Lenawee Ave', 'Culver City', 'Culver City', 'CA', '90232', 34.0182, -118.3761, array['Indoor courts','Coaching','Reservations','Pro shop']),
  ('00000000-0000-0000-0000-00000000c0a8', 'Padel Up — Culver City', array['padel'], '3007 Hauser Blvd', 'West Adams', 'Los Angeles', 'CA', '90016', 34.0265, -118.3652, array['Indoor courts','Gym','Recovery zone','Cafe','Reservations']),
  ('00000000-0000-0000-0000-00000000c0a9', 'Padel Up — Century City', array['padel'], '10250 Santa Monica Blvd', 'Century City', 'Los Angeles', 'CA', '90067', 34.0575, -118.4183, array['Rooftop courts','Coaching','Leagues','Reservations']),
  ('00000000-0000-0000-0000-00000000c0aa', 'Culver City Pickleball Courts', array['pickleball'], 'Culver Blvd & Elenda St', 'Culver City', 'Culver City', 'CA', '90230', 34.0101, -118.4051, array['Lighted courts','Free parking','Open play']),
  ('00000000-0000-0000-0000-00000000c0ab', 'Culver West Alexander Park', array['tennis','racquetball','pickleball'], '4162 Wade St', 'Mar Vista', 'Los Angeles', 'CA', '90066', 33.9933, -118.4339, array['Tennis courts','Racquetball courts','Pickleball','Playground','Free parking']),
  ('00000000-0000-0000-0000-00000000c0ac', 'Fox Hills Park', array['tennis','pickleball'], 'Green Valley Cir & Buckingham Pkwy', 'Fox Hills', 'Culver City', 'CA', '90230', 33.9834, -118.3859, array['Dedicated pickleball courts','Tennis courts','Restrooms','Walking path'])
on conflict (id) do nothing;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0029_court_search.sql
-- #############################################################################

-- 0029_court_search.sql — backing store for the LIVE court search.
-- The search itself runs server-side (service-role client); these tables are
-- locked to the service role only. Three tables:
--   1) zip_geocode        — ZIP → lat/lng, cached forever (ZIP centroids don't move)
--   2) court_search_cache — (zip, radius, sport) → the AI-filtered result list, with TTL
--   3) service_usage      — per-month counter of LIVE (paid) searches, for the spend cap
-- Idempotent.

-- 1) ZIP → coordinates cache (one geocode per ZIP, reused across radius/sport).
create table if not exists public.zip_geocode (
  zip        text primary key,
  lat        double precision not null,
  lng        double precision not null,
  fetched_at timestamptz not null default now()
);
alter table public.zip_geocode enable row level security;
revoke all on public.zip_geocode from anon, authenticated;
grant all on public.zip_geocode to service_role;

-- 2) Live search result cache. One row per (zip, radius_km, sport); refreshed when
--    older than the TTL the server enforces. `results` is the final AI-filtered list.
create table if not exists public.court_search_cache (
  zip        text not null,
  radius_km  int  not null,
  sport      text not null,
  results    jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (zip, radius_km, sport)
);
alter table public.court_search_cache enable row level security;
revoke all on public.court_search_cache from anon, authenticated;
grant all on public.court_search_cache to service_role;

-- 3) Monthly usage counter. The server increments live_search_count on each
--    uncached (paid) search and refuses new live calls past the configured cap.
create table if not exists public.service_usage (
  month             text primary key,  -- 'YYYY-MM' (UTC)
  live_search_count int  not null default 0,
  updated_at        timestamptz not null default now()
);
alter table public.service_usage enable row level security;
revoke all on public.service_usage from anon, authenticated;
grant all on public.service_usage to service_role;

-- Atomic "claim one live search if under cap": increments and returns true, or
-- returns false when the month is already at/over p_cap. Service-role only.
create or replace function public.claim_live_search(p_month text, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.service_usage (month, live_search_count)
    values (p_month, 0)
    on conflict (month) do nothing;

  update public.service_usage
     set live_search_count = live_search_count + 1,
         updated_at = now()
   where month = p_month
     and live_search_count < p_cap
   returning live_search_count into v_count;

  return v_count is not null;
end;
$$;
revoke all on function public.claim_live_search(text, int) from public, anon, authenticated;
grant execute on function public.claim_live_search(text, int) to service_role;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0030_match_courts.sql
-- #############################################################################

-- 0030_match_courts.sql — link matches to the court directory and let the
-- directory grow from real Google places selected during match creation.
-- Idempotent. No new user-facing insert policy on courts: the directory only
-- grows via the server (service role), so writes stay screened.

-- Courts discovered via Google get a stable dedupe key + the rating / visibility
-- metadata we already fetch, so a persisted court matches what search shows.
-- NOTE: a plain unique index (not partial) is intentional — Postgres treats NULLs
-- as distinct, so the seeded courts (google_place_id IS NULL) never collide, while
-- real place ids stay unique. A plain index also lets us upsert ON CONFLICT.
alter table public.courts add column if not exists google_place_id text;
alter table public.courts add column if not exists rating double precision;
alter table public.courts add column if not exists rating_count int;
alter table public.courts add column if not exists is_private boolean not null default false;
create unique index if not exists courts_google_place_id_key
  on public.courts (google_place_id);

-- A match can point at a directory court (nullable). location_text stays as the
-- free-text fallback / "court 3" note. Mirrors public.events.
alter table public.matches add column if not exists court_id uuid
  references public.courts(id) on delete set null;
create index if not exists matches_court_idx on public.matches (court_id);


-- #############################################################################
-- ## SOURCE: supabase/migrations/0031_courts_grants.sql
-- #############################################################################

-- 0031_courts_grants.sql — the court directory grows only through the server
-- (match creation persists Google-found courts via the service-role client).
-- The cache tables (0029) were explicitly granted to service_role, but the
-- courts table (0015) relied on default grants; make the grant explicit so the
-- "Schedule a match" / court-save path can insert. Also re-affirms the 0030
-- columns in case that migration didn't fully apply. Idempotent.

alter table public.courts add column if not exists google_place_id text;
alter table public.courts add column if not exists rating double precision;
alter table public.courts add column if not exists rating_count int;
alter table public.courts add column if not exists is_private boolean not null default false;
create unique index if not exists courts_google_place_id_key on public.courts (google_place_id);

grant all on public.courts to service_role;
grant all on public.court_reviews to service_role;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0032_presence.sql
-- #############################################################################

-- 0032_presence.sql — lightweight presence so admins can see who's active.
-- profiles.last_seen_at is touched (throttled) by the app shell on each page
-- load. No new RLS needed: the existing "update own profile" policy covers the
-- user-initiated heartbeat, and the verification / account_status guard triggers
-- only fire when those specific columns change — not this one.
alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc nulls last);


-- #############################################################################
-- ## SOURCE: supabase/migrations/0033_recurrence_and_feed_grant.sql
-- #############################################################################

-- 0033_recurrence_and_feed_grant.sql
-- 1) matches.recurrence — how often a recurring game repeats (weekly/biweekly/monthly).
-- 2) Make the service-role grant on feed_items explicit, so admin "Post to Feed"
--    writes succeed even if default grants didn't cover the table (mirrors 0031).
-- Idempotent.

alter table public.matches add column if not exists recurrence text;

grant all on public.feed_items to service_role;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0034_ensure_user_preferences.sql
-- #############################################################################

-- 0034_ensure_user_preferences.sql
-- Guarantees the settings table + its RLS exist (re-runs 0009 safely). If the
-- earlier migration was never applied, this is why "Save changes" failed.
-- Fully idempotent.

create table if not exists public.user_preferences (
  user_id                   uuid primary key references public.profiles(id) on delete cascade,
  notif_match_invites       boolean not null default true,
  notif_ranking_changes     boolean not null default true,
  notif_region_challenges   boolean not null default true,
  notif_marketplace_events  boolean not null default true,
  email_digest              text not null default 'weekly' check (email_digest in ('none','daily','weekly')),
  profile_visibility        text not null default 'members'       check (profile_visibility in ('public','members')),
  location_precision        text not null default 'neighborhood'  check (location_precision in ('city','neighborhood','zip')),
  who_can_invite            text not null default 'anyone'        check (who_can_invite in ('anyone','verified','nobody')),
  updated_at                timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "prefs read own" on public.user_preferences;
create policy "prefs read own" on public.user_preferences
  for select using (user_id = auth.uid());

drop policy if exists "prefs insert own" on public.user_preferences;
create policy "prefs insert own" on public.user_preferences
  for insert with check (user_id = auth.uid());

drop policy if exists "prefs update own" on public.user_preferences;
create policy "prefs update own" on public.user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());


-- #############################################################################
-- ## SOURCE: supabase/migrations/0035_profile_cover.sql
-- #############################################################################

-- 0035_profile_cover.sql — cover photo for the player's own profile page.
-- Stored in the existing public "avatars" bucket under the user's own folder
-- (covers/<uid>/…), so no new bucket or storage policy is needed. Idempotent.

alter table public.profiles add column if not exists cover_path text;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0036_teams_grants.sql
-- #############################################################################

-- 0036_teams_grants.sql
-- Make the service-role grants on the team tables explicit so server-side
-- membership/invite writes succeed (mirrors the courts/feed fixes). Also
-- re-asserts the tables/RLS from 0014 so nothing is missing. Idempotent.

-- Tables (no-ops if 0014 already created them).
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sport_key    text not null references public.sports(key),
  city         text,
  neighborhood text,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create table if not exists public.team_invites (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (team_id, invited_user_id)
);

-- Service-role writes happen in server actions (captain adds/removes members,
-- creates invites). Make the grant explicit in case defaults didn't cover it.
grant all on public.teams to service_role;
grant all on public.team_members to service_role;
grant all on public.team_invites to service_role;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0037_profile_names.sql
-- #############################################################################

-- 0037_profile_names.sql — capture legal first + last name at signup so a real
-- identity-verification step can match against it later. The app shows only the
-- first name (display_name). Idempotent.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

-- Bootstrap profile from signup metadata: store first/last name and default the
-- visible display_name to the first name (falling back to the email prefix).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, first_name, last_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'first_name', ''),
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0038_date_of_birth.sql
-- #############################################################################

-- 0038_date_of_birth.sql — full date of birth, captured at profile creation
-- (18+ enforced in the app). Age is derived from this for public display; the
-- exact date is never shown to other members. birth_year stays as a fallback.
-- Idempotent.

alter table public.profiles add column if not exists date_of_birth date;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0039_social_graph.sql
-- #############################################################################

-- 0039_social_graph.sql — the social layer Klimr was missing.
--   • friendships: mutual, require approval (protects team invites & messaging)
--   • follows: one-directional (follow a player to track their climb)
-- Writes go through the user's own client under RLS; service_role granted for
-- server-side helpers/notifications. Idempotent.

-- ---------- friendships (mutual, request/accept) ----------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
alter table public.friendships enable row level security;

drop policy if exists "friendships visible to either party" on public.friendships;
create policy "friendships visible to either party" on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships request own" on public.friendships;
create policy "friendships request own" on public.friendships
  for insert with check (requester_id = auth.uid());

-- The addressee accepts (flips status); requester can't self-accept.
drop policy if exists "friendships accept as addressee" on public.friendships;
create policy "friendships accept as addressee" on public.friendships
  for update using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

-- Either party can remove: decline, cancel a sent request, or unfriend.
drop policy if exists "friendships remove either" on public.friendships;
create policy "friendships remove either" on public.friendships
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------- follows (one-directional) ----------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;

-- Follower/following lists & counts are visible to any signed-in member.
drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows
  for select using (auth.role() = 'authenticated');

drop policy if exists "follows insert own" on public.follows;
create policy "follows insert own" on public.follows
  for insert with check (follower_id = auth.uid());

drop policy if exists "follows delete own" on public.follows;
create policy "follows delete own" on public.follows
  for delete using (follower_id = auth.uid());

grant all on public.friendships to service_role;
grant all on public.follows to service_role;


-- #############################################################################
-- ## SOURCE: supabase/migrations/0040_team_roles.sql
-- #############################################################################

-- 0040_team_roles.sql — real club structure for teams.
--   role:        owner | manager | staff | member   (admin level)
--   designation: captain | co_captain | sub | null   (playing role)
-- The original creator (previously stored as 'captain') becomes the owner.
-- Idempotent.

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check check (role in ('owner','manager','staff','member'));

alter table public.team_members
  add column if not exists designation text;
alter table public.team_members drop constraint if exists team_members_designation_check;
alter table public.team_members
  add constraint team_members_designation_check check (designation is null or designation in ('captain','co_captain','sub'));

-- Promote existing creators (stored as 'captain') to 'owner'.
update public.team_members set role = 'owner' where role = 'captain';

