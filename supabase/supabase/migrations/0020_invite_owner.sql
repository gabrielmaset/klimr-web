-- 0020_invite_owner.sql — let members own a personal invite code they can share.
-- Admin/batch codes keep owner_id NULL. Idempotent. RLS is already enabled on the
-- table (0002); the signup trigger is SECURITY DEFINER so it still works.

alter table public.invite_codes add column if not exists owner_id uuid references public.profiles(id) on delete set null;
create index if not exists invite_codes_owner_idx on public.invite_codes (owner_id);

-- A signed-in user may read the codes they own (for the Invite screen).
-- Codes are still minted server-side via the service role; there is no user insert policy.
drop policy if exists "own invite codes readable" on public.invite_codes;
create policy "own invite codes readable" on public.invite_codes
  for select using (owner_id = auth.uid());
