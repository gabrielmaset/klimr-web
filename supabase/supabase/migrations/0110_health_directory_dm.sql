-- 0110_health_directory_dm.sql — Health & Nutrition directory data + DM layer:
-- (1) Pro listing fields on class_providers (format, price-from, availability,
--     area, sports) — shown on the directory; pros edit them in Settings
--     (editor ships next; columns default sensibly meanwhile).
-- (2) health_article_reads + bump RPC — real read counts, set-based.
-- (3) Direct messages: conversations.peer_id + one-thread-per-pair index +
--     participant policies over the existing E2E tables (mirrors 0103's
--     additive pattern — match/listing chat untouched).

-- ── 1) pro listing fields ───────────────────────────────────────────────
alter table public.class_providers
  add column if not exists format text not null default 'both',
  add column if not exists price_from_cents integer,
  add column if not exists availability text not null default 'accepting',
  add column if not exists next_opening text,
  add column if not exists area_text text,
  add column if not exists sports text[] not null default '{}';

do $$ begin
  alter table public.class_providers
    add constraint class_providers_format_check check (format in ('virtual','inperson','both'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.class_providers
    add constraint class_providers_availability_check check (availability in ('accepting','waitlist'));
exception when duplicate_object then null; end $$;

-- ── 2) article read counts ──────────────────────────────────────────────
create table if not exists public.health_article_reads (
  slug text primary key,
  reads integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.health_article_reads enable row level security;
grant select on public.health_article_reads to authenticated;
do $$ begin
  create policy health_reads_select on public.health_article_reads for select using (true);
exception when duplicate_object then null; end $$;

create or replace function public.bump_article_read(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.health_article_reads (slug, reads)
  values (p_slug, 1)
  on conflict (slug) do update set reads = health_article_reads.reads + 1, updated_at = now();
$$;
grant execute on function public.bump_article_read(text) to authenticated;

-- ── 3) direct messages over the existing E2E chat tables ───────────────
alter table public.conversations
  add column if not exists peer_id uuid references public.profiles(id) on delete cascade;

create unique index if not exists conversations_dm_pair_unique
  on public.conversations (least(created_by, peer_id), greatest(created_by, peer_id))
  where kind = 'dm';

create or replace function public.is_dm_participant(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv_id
      and c.kind = 'dm'
      and (c.created_by = auth.uid() or c.peer_id = auth.uid())
  );
$$;
grant execute on function public.is_dm_participant(uuid) to authenticated;

do $$ begin
  create policy conversations_dm_select on public.conversations
    for select using (kind = 'dm' and public.is_dm_participant(id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_dm_insert on public.conversations
    for insert with check (
      kind = 'dm'
      and created_by = auth.uid()
      and peer_id is not null
      and peer_id <> auth.uid()
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_dm_select on public.messages
    for select using (public.is_dm_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_dm_insert on public.messages
    for insert with check (sender_id = auth.uid() and public.is_dm_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversation_keys_dm_select on public.conversation_keys
    for select using (public.is_dm_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversation_keys_dm_insert on public.conversation_keys
    for insert with check (public.is_dm_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversation_keys_dm_update on public.conversation_keys
    for update using (public.is_dm_participant(conversation_id));
exception when duplicate_object then null; end $$;
