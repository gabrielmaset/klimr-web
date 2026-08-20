-- 0137_business_tier_applications.sql — self-serve Tier-2 (sponsor-ready)
-- applications: the no-payments review checklist (business documents, domain,
-- brand kit, terms acceptance) submitted from the console instead of email.
-- Documents live in a PRIVATE bucket (mirrors 0051's payment-proof pattern:
-- AES-256 at rest, TLS only, reachable solely via authenticated requests or
-- short-lived server-minted signed URLs). Path convention:
-- <business_id>/<uuid>-<filename>, authorized by the first path segment.
-- One open application per business; users never update — decisions are
-- service-role-only from the admin queue.

-- ---------- private bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-docs',
  'business-docs',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = excluded.allowed_mime_types;

-- Authorize by the first path segment (the business id). Safe-cast inside so a
-- non-uuid path can never raise during policy evaluation.
create or replace function public.can_access_business_docs(seg text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare bid uuid;
begin
  begin
    bid := seg::uuid;
  exception when others then
    return false;
  end;
  return public.is_business_manager(bid, auth.uid());
end;
$$;
grant execute on function public.can_access_business_docs(text) to authenticated;

drop policy if exists "bdocs read" on storage.objects;
create policy "bdocs read" on storage.objects
  for select to authenticated
  using (bucket_id = 'business-docs' and public.can_access_business_docs((storage.foldername(name))[1]));

drop policy if exists "bdocs insert" on storage.objects;
create policy "bdocs insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-docs' and public.can_access_business_docs((storage.foldername(name))[1]));

drop policy if exists "bdocs delete" on storage.objects;
create policy "bdocs delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-docs' and public.can_access_business_docs((storage.foldername(name))[1]));

-- ---------- applications ----------
create table if not exists public.business_tier_applications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_accounts(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected')),
  domain text not null,
  notes text,
  docs jsonb not null default '[]'::jsonb,
  terms_accepted_at timestamptz not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists business_tier_app_open_idx
  on public.business_tier_applications (business_id) where status = 'submitted';
create index if not exists business_tier_app_status_idx
  on public.business_tier_applications (status, created_at desc);

-- eligibility: the business must be active and not already sponsor-ready;
-- one to eight documents; a real domain string
create or replace function public.enforce_tier_application_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text; v_level text; v_docs int;
begin
  select status, verification_level into v_status, v_level
  from business_accounts where id = new.business_id;
  if not found then
    raise exception 'business_missing' using errcode = '23503';
  end if;
  if v_status <> 'active' then
    raise exception 'not_active' using errcode = '23514';
  end if;
  if v_level = 'tier2' then
    raise exception 'already_tier2' using errcode = '23514';
  end if;
  v_docs := coalesce(jsonb_array_length(new.docs), 0);
  if v_docs < 1 or v_docs > 8 then
    raise exception 'bad_docs_count' using errcode = '23514';
  end if;
  if length(trim(new.domain)) < 4 or position('.' in new.domain) = 0 then
    raise exception 'bad_domain' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists business_tier_app_rules on public.business_tier_applications;
create trigger business_tier_app_rules before insert on public.business_tier_applications
  for each row execute function public.enforce_tier_application_rules();

alter table public.business_tier_applications enable row level security;

create policy "tier apps readable" on public.business_tier_applications
  for select to authenticated
  using (public.is_business_manager(business_id, auth.uid()));
create policy "managers apply" on public.business_tier_applications
  for insert to authenticated
  with check (submitted_by = auth.uid() and public.is_business_manager(business_id, auth.uid()));
create policy "withdraw while open" on public.business_tier_applications
  for delete to authenticated
  using (status = 'submitted' and public.is_business_manager(business_id, auth.uid()));
-- no user update policy: decisions are service-role writes from the admin queue

grant select, insert, delete on public.business_tier_applications to authenticated;
