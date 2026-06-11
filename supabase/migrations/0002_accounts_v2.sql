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
