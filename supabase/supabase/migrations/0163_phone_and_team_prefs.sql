-- 0163_phone_and_team_prefs.sql — account phone number + team notification prefs.
-- (1) profiles.phone_country / profiles.phone: a professional phone field at
--     sign-up and in Settings (US +1 only for now; the country lives in its
--     own column so adding countries later is data, not another migration).
--     `phone` stores digits only; the UI formats (###) ###-#### and the
--     server validates. Tournaments that require a phone rely on this
--     account-level field.
-- (2) user_preferences toggles powering Settings → Team notifications
--     (default on; enforced centrally in lib/notify's preference gate).
-- Idempotent.

alter table public.profiles
  add column if not exists phone_country text not null default 'US',
  add column if not exists phone text;

alter table public.user_preferences
  add column if not exists notif_team_invites boolean not null default true,
  add column if not exists notif_team_roster boolean not null default true,
  add column if not exists notif_team_activity boolean not null default true;
