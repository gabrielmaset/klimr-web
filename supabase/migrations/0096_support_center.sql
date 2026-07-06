-- 0096_support_center.sql — support tickets + AI support chat (conversations & messages)
-- Tickets are created by the contact form and by the AI assistant's escalation tool.
-- Conversations/messages persist AI support chats for continuity and admin review.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'form' check (source in ('form','ai_chat')),
  category text not null default 'question',
  severity text not null default 'normal' check (severity in ('normal','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  subject text not null,
  body text,
  ai_summary text,
  conversation_id uuid,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  escalated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Link ticket → transcript (added after conversations exists to avoid ordering issues)
alter table public.support_tickets
  add constraint support_tickets_conversation_fk
  foreign key (conversation_id) references public.support_conversations(id) on delete set null;

-- Hot paths are indexed lookups, never scans: the admin queue reads by status,
-- users read their own rows, and a chat loads one conversation's messages.
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_conversations_user_idx on public.support_conversations (user_id, updated_at desc);
create index if not exists support_messages_conversation_idx on public.support_messages (conversation_id, id);

alter table public.support_tickets enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- Table privileges come before RLS: authenticated may SELECT (RLS narrows to own
-- rows); all writes go through the service role in server actions.
grant select on public.support_tickets to authenticated;
grant select on public.support_conversations to authenticated;
grant select on public.support_messages to authenticated;

drop policy if exists "support_tickets_own" on public.support_tickets;
create policy "support_tickets_own" on public.support_tickets
  for select using (auth.uid() = user_id);

drop policy if exists "support_conversations_own" on public.support_conversations;
create policy "support_conversations_own" on public.support_conversations
  for select using (auth.uid() = user_id);

drop policy if exists "support_messages_own" on public.support_messages;
create policy "support_messages_own" on public.support_messages
  for select using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
