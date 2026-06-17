-- 0011_chat.sql — end-to-end encrypted, per-match group chat.
-- The server stores only PUBLIC keys, per-recipient WRAPPED keys, and CIPHERTEXT.
-- It never sees private keys or plaintext. Idempotent and safe to re-run.
--
-- Model (matches the phone demo): one conversation per match, group, ephemeral.
-- Crypto: each user has an ECDH P-256 identity keypair (private key lives only in
-- the browser). A random AES-GCM conversation key is wrapped for each member via an
-- ECDH shared secret. Messages are AES-GCM encrypted with the conversation key.

-- ---------- public keys, one row per (user, device) ----------
-- A user can have several devices (phone + web), each with its own keypair.
-- Messages are made readable to every registered device.
create table if not exists public.user_keys (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device_id  text not null,
  public_key text not null,                 -- base64 SPKI of the device's ECDH public key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.user_keys enable row level security;

drop policy if exists "keys readable" on public.user_keys;
create policy "keys readable" on public.user_keys
  for select using (auth.role() = 'authenticated');

drop policy if exists "keys insert own" on public.user_keys;
create policy "keys insert own" on public.user_keys
  for insert with check (user_id = auth.uid());

drop policy if exists "keys update own" on public.user_keys;
create policy "keys update own" on public.user_keys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- helper: is a user a participant of a match? (security definer to avoid RLS recursion) ----------
-- NOTE: this function already exists from 0001 with parameters (m_id, uid). We keep
-- those exact names so CREATE OR REPLACE is a no-op refresh rather than a parameter
-- rename (Postgres rejects renames on replace — error 42P13).
create or replace function public.is_match_participant(m_id uuid, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.match_participants where match_id = m_id and user_id = uid
  );
$$;

-- ---------- conversations (one per match) ----------
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null unique references public.matches(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.conversations enable row level security;

drop policy if exists "conv read if participant" on public.conversations;
create policy "conv read if participant" on public.conversations
  for select using (public.is_match_participant(match_id, auth.uid()));

drop policy if exists "conv insert if participant" on public.conversations;
create policy "conv insert if participant" on public.conversations
  for insert with check (public.is_match_participant(match_id, auth.uid()) and created_by = auth.uid());

-- ---------- helper: is a user a participant of a conversation's match? ----------
create or replace function public.is_conversation_participant(p_conv uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.conversations c
    join public.match_participants mp on mp.match_id = c.match_id
    where c.id = p_conv and mp.user_id = p_user
  );
$$;

-- ---------- conversation key, wrapped once per recipient DEVICE ----------
-- Each of a user's devices can unwrap it. wrapped_by/_device identify whose device
-- public key was used for the ECDH, so the recipient derives against the right key.
create table if not exists public.conversation_keys (
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  recipient_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_device  text not null,
  wrapped_key       text not null,
  iv                text not null,
  wrapped_by        uuid not null references public.profiles(id) on delete cascade,
  wrapped_by_device text not null,
  created_at        timestamptz not null default now(),
  primary key (conversation_id, recipient_id, recipient_device)
);
alter table public.conversation_keys enable row level security;

-- A participant can read all key rows for a conversation they're in (each row is
-- only decryptable by its own recipient anyway).
drop policy if exists "convkey read if participant" on public.conversation_keys;
create policy "convkey read if participant" on public.conversation_keys
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

-- A participant may wrap the key for any co-participant (key distribution / self-heal).
drop policy if exists "convkey insert" on public.conversation_keys;
create policy "convkey insert" on public.conversation_keys
  for insert with check (
    wrapped_by = auth.uid()
    and public.is_conversation_participant(conversation_id, auth.uid())
    and public.is_conversation_participant(conversation_id, recipient_id)
  );

drop policy if exists "convkey update" on public.conversation_keys;
create policy "convkey update" on public.conversation_keys
  for update using (public.is_conversation_participant(conversation_id, auth.uid()))
  with check (wrapped_by = auth.uid());

-- ---------- ciphertext messages ----------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  ciphertext      text not null,
  iv              text not null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);
alter table public.messages enable row level security;

drop policy if exists "msg read if participant" on public.messages;
create policy "msg read if participant" on public.messages
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "msg insert own" on public.messages;
create policy "msg insert own" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_conversation_participant(conversation_id, auth.uid())
  );
