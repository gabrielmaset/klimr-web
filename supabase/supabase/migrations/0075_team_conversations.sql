-- 0075_team_conversations.sql — one chat conversation per team (auto-created on
-- team creation, membership-derived access) plus a plaintext activity log for
-- team lifecycle changes. Extends the per-match chat model to team-scoped threads.
-- Idempotent and safe to re-run.

-- ---------- helper: team membership (security definer to avoid RLS recursion) ----------
create or replace function public.is_team_member(p_team uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = p_user);
$$;

-- ---------- conversations: support team-scoped threads alongside per-match ----------
alter table public.conversations add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.conversations add column if not exists kind text not null default 'match';
alter table public.conversations alter column match_id drop not null;

-- A conversation is anchored to a match XOR a team.
do $$ begin
  alter table public.conversations add constraint conversations_one_anchor
    check ((match_id is not null)::int + (team_id is not null)::int = 1);
exception when duplicate_object then null; end $$;

-- One conversation per team.
create unique index if not exists conversations_team_unique on public.conversations(team_id) where team_id is not null;

-- Team members can read (and, for completeness, the owner can create) their team's thread.
-- These are ADDITIVE to the existing per-match policies; RLS combines policies with OR.
drop policy if exists "conv read if team member" on public.conversations;
create policy "conv read if team member" on public.conversations
  for select using (team_id is not null and public.is_team_member(team_id, auth.uid()));

drop policy if exists "conv insert team owner" on public.conversations;
create policy "conv insert team owner" on public.conversations
  for insert with check (team_id is not null and public.is_team_member(team_id, auth.uid()) and created_by = auth.uid());

-- ---------- is_conversation_participant: cover team conversations too ----------
-- Used by messages / conversation_keys / conversation_events RLS. Match conversations
-- gate on match participation; team conversations gate on team membership.
create or replace function public.is_conversation_participant(p_conv uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conv and (
      (c.match_id is not null and exists (select 1 from public.match_participants mp where mp.match_id = c.match_id and mp.user_id = p_user))
      or
      (c.team_id is not null and exists (select 1 from public.team_members tm where tm.team_id = c.team_id and tm.user_id = p_user))
    )
  );
$$;

-- ---------- auto-create a conversation when a team is created ----------
create or replace function public.create_team_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.conversations (team_id, kind, created_by)
  values (new.id, 'team', new.created_by)
  on conflict do nothing; -- the unique team index makes this a no-op if it already exists
  return new;
end;
$$;

drop trigger if exists trg_team_conversation on public.teams;
create trigger trg_team_conversation after insert on public.teams
  for each row execute function public.create_team_conversation();

-- Backfill: give every existing team a conversation.
insert into public.conversations (team_id, kind, created_by)
select t.id, 'team', t.created_by
from public.teams t
where not exists (select 1 from public.conversations c where c.team_id = t.id);

-- ---------- plaintext activity log (system lines) ----------
-- End-to-end-encrypted user messages live in `messages`; these rows are
-- non-secret lifecycle events (joined / left / removed / renamed / ownership)
-- the server can write directly and every participant can read.
create table if not exists public.conversation_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind            text not null,
  actor_id        uuid references public.profiles(id) on delete set null,
  target_id       uuid references public.profiles(id) on delete set null,
  body            text,
  created_at      timestamptz not null default now()
);
create index if not exists conversation_events_conv_idx on public.conversation_events(conversation_id, created_at);
alter table public.conversation_events enable row level security;

drop policy if exists "events read if participant" on public.conversation_events;
create policy "events read if participant" on public.conversation_events
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));
-- Writes are server-side (service role) only — no client insert policy.

grant select on public.conversation_events to authenticated;
