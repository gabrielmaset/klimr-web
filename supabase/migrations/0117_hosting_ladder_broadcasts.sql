-- 0117_hosting_ladder_broadcasts.sql — the hosting ladder + admin broadcasts.
-- (1) Organizer / Tournament Director applications reuse provider rails:
--     phone (organizer requirement) + attestations (agreement/venue checkboxes
--     with timestamps) on provider_applications.
-- (2) broadcasts: an audit log of admin informational emails (subject, body,
--     audience filter, recipient count, sender). Service-role only — no
--     client policies on purpose.

alter table public.provider_applications
  add column if not exists phone text,
  add column if not exists attestations jsonb not null default '{}'::jsonb;

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  audience jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.broadcasts enable row level security;
