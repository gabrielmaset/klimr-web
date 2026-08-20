-- 0039_social_graph.sql — the social layer Klimr was missing.
--   • friendships: mutual, require approval (protects team invites & messaging)
--   • follows: one-directional (follow a player to track their climb)
-- Writes go through the user's own client under RLS; service_role granted for
-- server-side helpers/notifications. Idempotent.

-- ---------- friendships (mutual, request/accept) ----------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
alter table public.friendships enable row level security;

drop policy if exists "friendships visible to either party" on public.friendships;
create policy "friendships visible to either party" on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships request own" on public.friendships;
create policy "friendships request own" on public.friendships
  for insert with check (requester_id = auth.uid());

-- The addressee accepts (flips status); requester can't self-accept.
drop policy if exists "friendships accept as addressee" on public.friendships;
create policy "friendships accept as addressee" on public.friendships
  for update using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

-- Either party can remove: decline, cancel a sent request, or unfriend.
drop policy if exists "friendships remove either" on public.friendships;
create policy "friendships remove either" on public.friendships
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------- follows (one-directional) ----------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;

-- Follower/following lists & counts are visible to any signed-in member.
drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows
  for select using (auth.role() = 'authenticated');

drop policy if exists "follows insert own" on public.follows;
create policy "follows insert own" on public.follows
  for insert with check (follower_id = auth.uid());

drop policy if exists "follows delete own" on public.follows;
create policy "follows delete own" on public.follows
  for delete using (follower_id = auth.uid());

grant all on public.friendships to service_role;
grant all on public.follows to service_role;
