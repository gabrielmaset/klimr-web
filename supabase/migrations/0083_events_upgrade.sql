-- 0083_events_upgrade.sql — richer events: recurring meetups, a WhatsApp group link,
--   co-admins, an approval-to-join policy, and a per-event live-queue toggle. Idempotent.

-- 1) new event fields
alter table public.events add column if not exists whatsapp_url   text;
alter table public.events add column if not exists queue_enabled  boolean not null default false;  -- show the live queue on this event
alter table public.events add column if not exists join_policy    text not null default 'open' check (join_policy in ('open','approval'));
alter table public.events add column if not exists recurrence      text not null default 'none' check (recurrence in ('none','daily','weekly','biweekly','monthly'));
alter table public.events add column if not exists recurrence_days text[] not null default '{}';   -- weekday codes (SU MO TU WE TH FR SA) for weekly/biweekly

-- 2) RSVP status, so approval-required events can hold pending requests.
--    Existing rows become confirmed ('going'); new joins on approval events are 'pending'.
alter table public.event_rsvps add column if not exists status text not null default 'going' check (status in ('going','pending'));
create index if not exists event_rsvps_event_status_idx on public.event_rsvps (event_id, status);

-- 3) co-admins. The owner is events.created_by; managers are extra admins the owner adds.
create table if not exists public.event_managers (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_managers_user_idx on public.event_managers (user_id);

alter table public.event_managers enable row level security;
drop policy if exists "event_managers readable" on public.event_managers;
create policy "event_managers readable" on public.event_managers for select using (auth.role() = 'authenticated');
grant select on public.event_managers to authenticated;
grant all on public.event_managers to service_role;
