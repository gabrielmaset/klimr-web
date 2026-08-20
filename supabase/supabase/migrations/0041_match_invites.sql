-- 0041_match_invites.sql — direct match invites (organizer invites a friend to a match).
-- An organizer can invite players they're friends with to fill a match. The invitee
-- accepts (and joins the roster if there's room) or declines. Idempotent / safe to re-run.

create table if not exists public.match_invites (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (match_id, invited_user_id)
);

create index if not exists match_invites_invitee_idx on public.match_invites (invited_user_id, status);
create index if not exists match_invites_match_idx   on public.match_invites (match_id);

alter table public.match_invites enable row level security;

-- The invitee and the inviter can both see the invite.
drop policy if exists "match_invites read" on public.match_invites;
create policy "match_invites read" on public.match_invites
  for select using (invited_user_id = auth.uid() or invited_by = auth.uid());

-- Only the inviter creates the invite (the server action also verifies they
-- organize the match and are friends with the invitee).
drop policy if exists "match_invites insert" on public.match_invites;
create policy "match_invites insert" on public.match_invites
  for insert with check (invited_by = auth.uid());

-- The invitee responds (accept / decline).
drop policy if exists "match_invites respond" on public.match_invites;
create policy "match_invites respond" on public.match_invites
  for update using (invited_user_id = auth.uid()) with check (invited_user_id = auth.uid());

-- Either side can remove it (invitee declines-and-clears, or inviter cancels).
drop policy if exists "match_invites delete" on public.match_invites;
create policy "match_invites delete" on public.match_invites
  for delete using (invited_user_id = auth.uid() or invited_by = auth.uid());

grant all on public.match_invites to service_role;
