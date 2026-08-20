-- 0072_tournament_waitlist.sql — event waitlist (Klimr-account + email-only) with status, ordering, and RLS

create table if not exists public.tournament_waitlist (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  division_id uuid references public.tournament_divisions(id) on delete set null,
  kind text not null check (kind in ('account', 'email')),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  name text,
  status text not null default 'waiting' check (status in ('waiting', 'invited', 'converted', 'removed')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  -- account rows carry a user_id; email rows carry an email
  constraint tournament_waitlist_identity_chk check (
    (kind = 'account' and user_id is not null) or
    (kind = 'email' and email is not null)
  )
);

create index if not exists tournament_waitlist_lookup_idx
  on public.tournament_waitlist (tournament_id, status, created_at);

-- one active spot in line per account / per email, per event
create unique index if not exists tournament_waitlist_user_uniq
  on public.tournament_waitlist (tournament_id, user_id)
  where user_id is not null and status in ('waiting', 'invited');

create unique index if not exists tournament_waitlist_email_uniq
  on public.tournament_waitlist (tournament_id, lower(email))
  where email is not null and status in ('waiting', 'invited');

alter table public.tournament_waitlist enable row level security;

-- Organizer (event owner) can read and manage their event's waitlist.
drop policy if exists tournament_waitlist_owner_all on public.tournament_waitlist;
create policy tournament_waitlist_owner_all on public.tournament_waitlist
  for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));

-- A signed-in person can see their own waitlist rows.
drop policy if exists tournament_waitlist_self_read on public.tournament_waitlist;
create policy tournament_waitlist_self_read on public.tournament_waitlist
  for select
  using (user_id = auth.uid());

-- Joining the waitlist (account or email-only) is done through a Server Action
-- using the service role, so no public INSERT policy is needed here.
