-- 0010_feed_items.sql — system/curated feed (match results, news, announcements).
-- Users do NOT post here yet; only the system (service role) and admins write.
-- Readable by any signed-in user. Idempotent and safe to re-run.

create table if not exists public.feed_items (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'announcement' check (kind in ('announcement','news','result','update')),
  title        text,
  body         text not null,
  sport_key    text references public.sports(key),
  link_url     text,
  link_label   text,
  created_by   uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists feed_items_published_idx on public.feed_items (published_at desc);

alter table public.feed_items enable row level security;

-- Anyone signed in can read published items. Writes are service-role/admin only
-- (no insert/update/delete policies for normal users => RLS denies them).
drop policy if exists "feed read published" on public.feed_items;
create policy "feed read published" on public.feed_items
  for select using (auth.role() = 'authenticated' and published_at <= now());

-- Seed a welcome announcement so the feed isn't empty (fixed id => idempotent).
insert into public.feed_items (id, kind, title, body)
values
  ('00000000-0000-0000-0000-00000000feed', 'announcement', 'Welcome to Klimr',
   'Your local racquet sports ladder is live. Climb your ZIP, then your city, then the world. Match results, news, and product updates will show up right here.')
on conflict (id) do nothing;
