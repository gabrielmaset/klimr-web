-- 0108_provider_reviews.sql — member reviews for verified professionals
-- (health pros + coaches). One review per member per provider, editable,
-- no self-reviews. Aggregates live on class_providers (rating_avg/count),
-- maintained by a SECURITY DEFINER trigger — never a per-request scan.

create table if not exists public.provider_reviews (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references public.class_providers(user_id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_user_id, reviewer_id)
);
create index if not exists provider_reviews_provider_idx on public.provider_reviews (provider_user_id, created_at desc);

alter table public.class_providers
  add column if not exists rating_avg numeric(3,2),
  add column if not exists rating_count integer not null default 0;

create or replace function public.recount_provider_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare pid uuid;
begin
  pid := coalesce(new.provider_user_id, old.provider_user_id);
  update public.class_providers cp
     set rating_count = agg.n,
         rating_avg = agg.avg
    from (
      select count(*)::int as n, round(avg(rating)::numeric, 2) as avg
      from public.provider_reviews
      where provider_user_id = pid
    ) agg
   where cp.user_id = pid;
  return null;
end;
$$;

drop trigger if exists provider_reviews_recount on public.provider_reviews;
create trigger provider_reviews_recount
  after insert or update or delete on public.provider_reviews
  for each row execute function public.recount_provider_rating();

alter table public.provider_reviews enable row level security;
grant select, insert, update, delete on public.provider_reviews to authenticated;

do $$ begin
  create policy provider_reviews_read on public.provider_reviews
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy provider_reviews_insert on public.provider_reviews
    for insert with check (
      reviewer_id = auth.uid()
      and reviewer_id <> provider_user_id
      and exists (select 1 from public.class_providers cp where cp.user_id = provider_user_id and cp.status = 'approved')
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy provider_reviews_own_update on public.provider_reviews
    for update using (reviewer_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy provider_reviews_own_delete on public.provider_reviews
    for delete using (reviewer_id = auth.uid());
exception when duplicate_object then null; end $$;
