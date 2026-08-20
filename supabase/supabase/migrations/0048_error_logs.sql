-- 0048_error_logs.sql — central client error log for admin diagnostics.
--
-- Client errors / uncaught exceptions from ANY user are reported here through a
-- server action that writes with the service role. Admins read them from the
-- Admin → Diagnostics page (also via the service role). Authenticated and
-- anonymous roles have NO direct access — mirrors admin_actions. Idempotent.

create table if not exists public.error_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  level      text not null default 'error' check (level in ('error', 'warn', 'info')),
  message    text not null,
  detail     text,
  url        text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.error_logs enable row level security;
revoke all on public.error_logs from anon, authenticated;
grant all on public.error_logs to service_role;
create index if not exists error_logs_created_idx on public.error_logs (created_at desc);
create index if not exists error_logs_level_idx on public.error_logs (level);
