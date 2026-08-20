-- 0105_user_identity_ledger.sql — durable user identification & lawful retention:
-- (1) member_no: a short, human-readable, immutable member number on every
--     profile (never reused), for support and admin identification.
-- (2) deleted_users_ledger: the restricted record that survives account purge —
--     the only mapping from a purged UUID back to an identity. Retained under
--     CCPA §1798.105(d) exemptions (security/fraud, debugging, legal obligation)
--     and §7022's record-of-deletion requirement. Service-role access only.
-- (3) error_logs.user_id keeps its UUID after purge (FK dropped): logs become
--     pseudonymous the moment the profile is gone — the Facebook model — with
--     the ledger as the controlled re-association path.
-- (4) The scheduled purge writes the ledger before deleting each account.

-- ── 1) member number ────────────────────────────────────────────────────
create sequence if not exists public.klimr_member_no_seq start 10001;

alter table public.profiles add column if not exists member_no bigint;

update public.profiles p
   set member_no = s.n
  from (
    select id, nextval('public.klimr_member_no_seq') as n
    from public.profiles
    where member_no is null
    order by created_at asc, id asc
  ) s
 where p.id = s.id and p.member_no is null;

alter table public.profiles alter column member_no set default nextval('public.klimr_member_no_seq');
create unique index if not exists profiles_member_no_unique on public.profiles (member_no);

-- ── 2) the deletion ledger (service-role only) ─────────────────────────
create table if not exists public.deleted_users_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  member_no bigint,
  display_name text,
  email text,
  account_created_at timestamptz,
  archived_at timestamptz,
  purged_at timestamptz not null default now(),
  purged_by uuid,
  reason text not null default 'scheduled_purge'
);
create unique index if not exists deleted_users_ledger_user_idx on public.deleted_users_ledger (user_id);

alter table public.deleted_users_ledger enable row level security;
revoke all on public.deleted_users_ledger from public, anon, authenticated;
-- No policies on purpose: only the service role reads or writes this table.

-- ── 3) logs outlive accounts (pseudonymous UUID, no cascade) ───────────
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'error_logs' and con.contype = 'f' and att.attname = 'user_id'
  loop
    execute format('alter table public.error_logs drop constraint %I', c.conname);
  end loop;
end $$;

-- ── 4) scheduled purge writes the ledger first ─────────────────────────
create or replace function public.purge_archived_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  insert into public.deleted_users_ledger
    (user_id, member_no, display_name, email, account_created_at, archived_at, reason)
  select p.id, p.member_no, p.display_name, u.email, p.created_at, p.archived_at, 'scheduled_purge'
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.account_status = 'archived'
    and p.archived_at is not null
    and p.archived_at < now() - interval '30 days'
  on conflict (user_id) do nothing;

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
