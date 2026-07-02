-- 0095_gate_email_access.sql — let an existing, active account-holder pass the
-- klimr.com invite gate by receiving a one-time code by email, instead of needing
-- a fresh invite every time.
--
--  • gate_access_codes: short-lived, single-use codes emailed to a specific
--    address. Minted server-side ONLY, and only for addresses that already have
--    an active account. Kept in their OWN table (separate from invite_codes) so
--    they can never be used to sign up and never touch the invite pool. They are
--    minted in the same XXXX-XXXX-XXXX shape as invite codes, so the existing gate
--    code box accepts them with no UI change.
--
--  • account_active_for_email(text): returns true iff some confirmed auth user
--    with that address has an active profile. SECURITY DEFINER so it can read the
--    auth schema; the match is an indexed lower(email) lookup on auth.users, so it
--    scales with no scan over the user base (same approach as reconcile_account_email).
--    Returns only a boolean, so it never reveals whether an account exists to anyone
--    but the server.
--
-- Idempotent. No anon/authenticated access: only the service role (server actions)
-- ever reads or writes gate_access_codes or calls the function.

create table if not exists public.gate_access_codes (
  code       text primary key,
  email      text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gate_access_codes_email_lower_idx on public.gate_access_codes (lower(email));
create index if not exists gate_access_codes_expires_idx on public.gate_access_codes (expires_at);

alter table public.gate_access_codes enable row level security;
-- No policies on purpose — the table is service-role only. Grant the service role
-- table privileges explicitly (it bypasses RLS but still needs the GRANT).
grant select, insert, update, delete on public.gate_access_codes to service_role;

-- ── active-account-by-email check ────────────────────────────────────────────
create or replace function public.account_active_for_email(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(coalesce(p_email, ''))
      and u.email_confirmed_at is not null
      and p.account_status = 'active'
  );
$$;

revoke all on function public.account_active_for_email(text) from public;
revoke all on function public.account_active_for_email(text) from anon;
revoke all on function public.account_active_for_email(text) from authenticated;
grant execute on function public.account_active_for_email(text) to service_role;
