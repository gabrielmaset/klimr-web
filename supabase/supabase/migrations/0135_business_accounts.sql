-- 0135_business_accounts.sql — Business Accounts foundation (decision #2: MERGE).
-- A business account is the organizational tenant: professionals (merged from
-- class_providers), venues, shops, clubs, brands. Membership with owner/manager/
-- staff roles, an auto-owner trigger, last-owner protection, and a guard that
-- keeps verification_level/status service-role-only (the 0006 moderation-guard
-- pattern). Tier vocabulary per the no-payments decision: none | tier1 | tier2
-- (tier2 = sponsor-ready via document review — the payments phase adds nothing
-- here). Everything ships dark: `published` defaults false AND the seeded
-- `business_publication` flag gates rendering.
-- MERGE PATH: every approved class_provider gets a kind='professional' business;
-- class_providers.business_id links them (classes keep provider_id — non-breaking).

create table if not exists public.business_accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('professional','venue','shop','club','brand')),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  headline text,
  bio text,
  website text,
  contact_email text,
  phone text,
  area_text text,
  sports text[] not null default '{}',
  roles text[] not null default '{}',
  logo_path text,
  verification_level text not null default 'none'
    check (verification_level in ('none','tier1','tier2')),
  status text not null default 'draft'
    check (status in ('draft','active','suspended')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_accounts_owner_idx on public.business_accounts (owner_id);
create index if not exists business_accounts_public_idx
  on public.business_accounts (kind, status) where published = true;

create table if not exists public.business_members (
  business_id uuid not null references public.business_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists business_members_user_idx on public.business_members (user_id);

-- shared membership check (SECURITY DEFINER: avoids recursive RLS)
create or replace function public.is_business_manager(p_business uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_members m
    where m.business_id = p_business and m.user_id = p_uid and m.role in ('owner','manager')
  );
$$;
revoke all on function public.is_business_manager(uuid, uuid) from public, anon;
grant execute on function public.is_business_manager(uuid, uuid) to authenticated, service_role;

-- creating a business seats its owner
create or replace function public.business_auto_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into business_members (business_id, user_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists business_accounts_auto_owner on public.business_accounts;
create trigger business_accounts_auto_owner after insert on public.business_accounts
  for each row execute function public.business_auto_owner();

-- a business can never lose its last owner
create or replace function public.protect_last_owner()
returns trigger language plpgsql as $$
declare remaining int;
begin
  -- when the business itself is being deleted, the member cascade must pass
  if not exists (select 1 from business_accounts where id = old.business_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    select count(*) into remaining from business_members
    where business_id = old.business_id and role = 'owner'
      and not (user_id = old.user_id);
    if remaining = 0 then
      raise exception 'last_owner' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists business_members_last_owner on public.business_members;
create trigger business_members_last_owner before update or delete on public.business_members
  for each row execute function public.protect_last_owner();

-- verification_level and status move only by the service role (admin review)
create or replace function public.guard_business_protected()
returns trigger language plpgsql as $$
begin
  if current_user <> 'service_role' then
    new.verification_level := old.verification_level;
    new.status := old.status;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists business_accounts_guard on public.business_accounts;
create trigger business_accounts_guard before update on public.business_accounts
  for each row execute function public.guard_business_protected();

-- ---------- RLS ----------
alter table public.business_accounts enable row level security;
alter table public.business_members enable row level security;

create policy "businesses readable" on public.business_accounts
  for select to authenticated using (
    (published = true and status = 'active')
    or exists (select 1 from public.business_members m where m.business_id = id and m.user_id = auth.uid())
  );
create policy "create own business" on public.business_accounts
  for insert to authenticated with check (owner_id = auth.uid() and status = 'draft');
create policy "managers update business" on public.business_accounts
  for update to authenticated
  using (public.is_business_manager(id, auth.uid()))
  with check (public.is_business_manager(id, auth.uid()));

create policy "members readable" on public.business_members
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.business_members m where m.business_id = business_id and m.user_id = auth.uid())
  );
create policy "managers add members" on public.business_members
  for insert to authenticated with check (
    public.is_business_manager(business_id, auth.uid())
    and added_by = auth.uid()
    and role in ('manager','staff')
  );
create policy "leave or remove" on public.business_members
  for delete to authenticated using (
    user_id = auth.uid()
    or (public.is_business_manager(business_id, auth.uid()) and role <> 'owner')
  );

grant select, insert, update on public.business_accounts to authenticated;
grant select, insert, delete on public.business_members to authenticated;

-- ---------- provider merge ----------
alter table public.class_providers
  add column if not exists business_id uuid unique references public.business_accounts(id) on delete set null;

-- one professional business per approved provider; slug from the member's name,
-- uniqued with a short id suffix; basic providers start tier 'none',
-- id_verified/background_checked map to tier1 (tier2 remains document review).
with src as (
  select cp.user_id, cp.headline, cp.bio, cp.roles, cp.sports, cp.area_text,
         cp.verification_level as pv, p.display_name
  from public.class_providers cp
  join public.profiles p on p.id = cp.user_id
  where cp.status = 'approved' and cp.business_id is null
),
ins as (
  insert into public.business_accounts
    (kind, name, slug, owner_id, headline, bio, area_text, sports, roles,
     verification_level, status, published)
  select 'professional',
         s.display_name,
         lower(regexp_replace(s.display_name, '[^a-zA-Z0-9]+', '-', 'g'))
           || '-' || substr(md5(s.user_id::text), 1, 4),
         s.user_id, s.headline, s.bio, s.area_text, s.sports, s.roles,
         case when s.pv in ('id_verified','background_checked') then 'tier1' else 'none' end,
         'active', false
  from src s
  returning id, owner_id
)
update public.class_providers cp
set business_id = ins.id
from ins
where cp.user_id = ins.owner_id;
