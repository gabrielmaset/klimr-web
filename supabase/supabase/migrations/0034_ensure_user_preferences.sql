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
