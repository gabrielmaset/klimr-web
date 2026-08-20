-- 0103_listing_chat_policies.sql — additive RLS so listing-scoped chat rows
-- (buyer ↔ seller) work through the existing E2E tables. Match-chat policies
-- are untouched; policies OR-combine, so this only ADDS access.

-- Participant test for a listing conversation: the buyer who opened it, or
-- the listing's seller.
create or replace function public.is_listing_conv_participant(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations c
    join public.marketplace_listings l on l.id = c.listing_id
    where c.id = conv_id
      and c.listing_id is not null
      and (c.created_by = auth.uid() or l.listed_by = auth.uid())
  );
$$;

grant execute on function public.is_listing_conv_participant(uuid) to authenticated;

-- conversations: read your listing threads; buyers open them; the seller may
-- close/reopen them (expiry) when the listing closes.
do $$ begin
  create policy conversations_listing_select on public.conversations
    for select using (listing_id is not null and public.is_listing_conv_participant(id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_listing_insert on public.conversations
    for insert with check (
      listing_id is not null
      and created_by = auth.uid()
      and exists (
        select 1 from public.marketplace_listings l
        where l.id = listing_id
          and l.listed_by is not null
          and l.listed_by <> auth.uid()
          and l.status in ('active','pending')
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_listing_update on public.conversations
    for update using (listing_id is not null and public.is_listing_conv_participant(id));
exception when duplicate_object then null; end $$;

-- messages: participants read + write (as themselves) in listing threads.
do $$ begin
  create policy messages_listing_select on public.messages
    for select using (public.is_listing_conv_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_listing_insert on public.messages
    for insert with check (
      sender_id = auth.uid() and public.is_listing_conv_participant(conversation_id)
    );
exception when duplicate_object then null; end $$;

-- conversation_keys: participants read their wrapped keys and wrap for each other.
do $$ begin
  create policy conversation_keys_listing_select on public.conversation_keys
    for select using (public.is_listing_conv_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversation_keys_listing_insert on public.conversation_keys
    for insert with check (public.is_listing_conv_participant(conversation_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversation_keys_listing_update on public.conversation_keys
    for update using (public.is_listing_conv_participant(conversation_id));
exception when duplicate_object then null; end $$;

-- conversation_reads: generic per-user upsert may already be allowed; add the
-- listing-scoped grant explicitly for safety.
do $$ begin
  create policy conversation_reads_listing on public.conversation_reads
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;
