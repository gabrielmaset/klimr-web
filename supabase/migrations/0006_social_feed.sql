-- Klimr — social feed (Phase 3): posts with media, likes, and comments.
--
-- SAFETY MODEL — AI pre-publish moderation:
--   The app classifies post text and media server-side (lib/moderation.ts) BEFORE
--   anything is written, and only the service role may set moderation_status =
--   'approved'. A BEFORE-INSERT trigger forces every non-service-role insert to
--   'pending', and a BEFORE-UPDATE trigger blocks non-service-role status changes,
--   so a client can never bypass the safety gate by writing directly. The feed
--   shows only 'approved' rows (authors can additionally see their own).
--
--   NOTE: an AI classifier is a strong first line, not a complete child-safety
--   solution. Hosting user media in production also calls for hash-matching against
--   known-CSAM databases (PhotoDNA / NCMEC) and a legal reporting path. Treat this
--   as the application-layer gate, not the whole compliance story.

create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'flagged');

-- ---------- posts ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  sport_key text references public.sports(key),
  match_id uuid references public.matches(id) on delete set null,
  moderation_status public.moderation_status not null default 'pending',
  moderation_labels text[],
  created_at timestamptz not null default now()
);
create index posts_approved_idx on public.posts (created_at desc) where moderation_status = 'approved';
create index posts_author_idx on public.posts (author_id);

-- ---------- post media (images now; 'video' reserved for when video moderation lands) ----------
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index post_media_post_idx on public.post_media (post_id);

-- ---------- likes ----------
create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------- comments ----------
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  moderation_status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id) where moderation_status = 'approved';

-- ---------- moderation guards (service role is the only publisher) ----------
create or replace function public.force_moderation_pending()
returns trigger language plpgsql as $$
begin
  if current_user <> 'service_role' then
    new.moderation_status := 'pending';
  end if;
  return new;
end; $$;

create or replace function public.guard_moderation_update()
returns trigger language plpgsql as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and current_user <> 'service_role' then
    new.moderation_status := old.moderation_status;
  end if;
  return new;
end; $$;

create trigger posts_force_pending before insert on public.posts
  for each row execute function public.force_moderation_pending();
create trigger posts_guard_update before update on public.posts
  for each row execute function public.guard_moderation_update();
create trigger post_comments_force_pending before insert on public.post_comments
  for each row execute function public.force_moderation_pending();
create trigger post_comments_guard_update before update on public.post_comments
  for each row execute function public.guard_moderation_update();

-- security-definer helper: avoid recursive RLS when media/likes/comments check posts
create or replace function public.post_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id and (p.moderation_status = 'approved' or p.author_id = auth.uid())
  );
$$;

-- ---------- RLS ----------
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

create policy "posts readable" on public.posts
  for select to authenticated using (moderation_status = 'approved' or author_id = auth.uid());
create policy "insert own post" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "update own post" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete own post" on public.posts
  for delete to authenticated using (author_id = auth.uid());

create policy "post_media readable" on public.post_media
  for select to authenticated using (public.post_visible(post_id));
create policy "insert own post_media" on public.post_media
  for insert to authenticated with check (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );
create policy "delete own post_media" on public.post_media
  for delete to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy "likes readable" on public.post_likes
  for select to authenticated using (true);
create policy "like own" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid() and public.post_visible(post_id));
create policy "unlike own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

create policy "comments readable" on public.post_comments
  for select to authenticated using (
    (moderation_status = 'approved' or author_id = auth.uid()) and public.post_visible(post_id)
  );
create policy "insert own comment" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid() and public.post_visible(post_id));
create policy "delete own comment" on public.post_comments
  for delete to authenticated using (author_id = auth.uid());

-- ---------- grants ----------
grant select, insert, update, delete on
  public.posts, public.post_media, public.post_likes, public.post_comments to authenticated;
grant all on public.posts, public.post_media, public.post_likes, public.post_comments to service_role;
grant execute on function public.post_visible(uuid) to authenticated, service_role;

-- ---------- storage bucket for post media (public read; writes via service role) ----------
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

create policy "post-media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-media');
