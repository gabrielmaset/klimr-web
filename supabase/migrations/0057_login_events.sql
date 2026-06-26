-- 0057_login_events.sql — login activity for the security page.
--
-- Supabase does not expose session device/IP history to the client, so we record
-- our own row on each completed sign-in (after the 2FA step). Users can read only
-- their own events; rows are written by the user's own session with server-derived
-- values (IP, user-agent, approximate location), never client-supplied.

create table if not exists public.login_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  ip         text,
  user_agent text,
  device     text,   -- Desktop | Mobile | Tablet
  browser    text,   -- Chrome | Safari | Firefox | Edge | ...
  os         text,   -- Windows | macOS | iOS | Android | Linux
  city       text,
  region     text,
  country    text
);

create index if not exists login_events_user_idx on public.login_events (user_id, created_at desc);

alter table public.login_events enable row level security;

drop policy if exists "login_events select own" on public.login_events;
create policy "login_events select own" on public.login_events
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "login_events insert own" on public.login_events;
create policy "login_events insert own" on public.login_events
  for insert to authenticated with check (user_id = auth.uid());

-- No update/delete for users; rows are immutable login history.
grant select, insert on public.login_events to authenticated;
