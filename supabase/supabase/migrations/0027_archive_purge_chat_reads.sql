-- 0027: account archive + 30-day purge, and chat read state.
--
-- Prereq: pg_cron must be available. If `create extension` below errors, enable
-- it once in the dashboard (Database → Extensions → search "pg_cron" → enable),
-- then re-run this migration.

-- ============================================================
-- 1) Archive (soft delete)
-- ============================================================
-- Admin "delete" archives instead of hard-deleting: the account is hidden and
-- recoverable for 30 days, then purged (below). Allow the 'archived' state and
-- record when it happened. The existing guard_account_status trigger still only
-- lets the service role change account_status, so this is admin-only.
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'suspended', 'banned', 'archived'));

alter table public.profiles add column if not exists archived_at timestamptz;

-- ============================================================
-- 2) Scheduled purge (pg_cron)
-- ============================================================
-- Hard-deletes accounts archived more than 30 days ago. Deleting the auth user
-- cascades through every table that references profiles(id) on delete cascade
-- (and the auth.* tables), so this single statement fully removes the account.
-- The admin_actions audit log is preserved (its actor/target are set null).
create extension if not exists pg_cron;

create or replace function public.purge_archived_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
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

-- Nightly at 03:30 UTC. Scheduling with an existing name updates the job.
select cron.schedule('purge-archived-accounts', '30 3 * * *', $$select public.purge_archived_accounts();$$);

-- ============================================================
-- 3) Chat read state (powers the Chats unread bubble)
-- ============================================================
create table if not exists public.conversation_reads (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.conversation_reads enable row level security;

drop policy if exists "reads own select" on public.conversation_reads;
create policy "reads own select" on public.conversation_reads
  for select using (user_id = auth.uid());

drop policy if exists "reads own insert" on public.conversation_reads;
create policy "reads own insert" on public.conversation_reads
  for insert with check (
    user_id = auth.uid() and public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "reads own update" on public.conversation_reads;
create policy "reads own update" on public.conversation_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Count of the caller's conversations that have a message they haven't seen
-- (newer than their last read, not sent by them), among still-active threads.
create or replace function public.chat_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.conversations c
  join public.match_participants mp
    on mp.match_id = c.match_id and mp.user_id = auth.uid()
  where (c.expires_at is null or c.expires_at > now())
    and exists (
      select 1 from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.conversation_reads r
            where r.user_id = auth.uid() and r.conversation_id = c.id),
          '-infinity'::timestamptz
        )
    );
$$;

revoke all on function public.chat_unread_count() from public, anon;
grant execute on function public.chat_unread_count() to authenticated;

-- ============================================================
-- 4) Keep archived accounts out of public leaderboards
-- ============================================================
-- Recreate ranked_players with an archived filter (preserving the 0022 search_path
-- hardening). Suspended/banned standings still show; only archived (pending
-- deletion) accounts are removed from the boards.
create or replace function public.ranked_players(
  p_sport text,
  p_scope text default 'world',
  p_region text default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_hue int,
  verification_status public.verification_status,
  points int,
  skill_rating numeric,
  matches_played int,
  wins int,
  rank bigint
)
language sql stable
set search_path = public
as $$
  select
    ps.user_id,
    pr.display_name,
    pr.avatar_hue,
    pr.verification_status,
    ps.points,
    ps.skill_rating,
    ps.matches_played,
    ps.wins,
    rank() over (order by ps.points desc)
  from public.player_sports ps
  join public.profiles pr on pr.id = ps.user_id
  where ps.sport_key = p_sport
    and pr.account_status <> 'archived'
    and case p_scope
      when 'world' then true
      when 'national' then pr.country is not distinct from coalesce(p_region, pr.country)
      when 'state' then pr.state is not distinct from p_region
      when 'city' then pr.city is not distinct from p_region
      when 'neighborhood' then pr.neighborhood is not distinct from p_region
      when 'zip' then pr.home_zip is not distinct from p_region
      else false
    end
  order by ps.points desc;
$$;
