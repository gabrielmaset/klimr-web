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
