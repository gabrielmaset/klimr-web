-- 0013_notifications.sql — per-user in-app notifications.
-- System/service writes them; users read and mark their own as read. Idempotent.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'system'
             check (kind in ('match_invite','match_join','match_confirm','ranking','region_challenge','marketplace','sponsorship','system')),
  title      text not null,
  body       text,
  link_url   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notif read own" on public.notifications;
create policy "notif read own" on public.notifications
  for select using (user_id = auth.uid());

-- Users may mark their own notifications as read (no inserts; system writes via service role).
drop policy if exists "notif update own" on public.notifications;
create policy "notif update own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
