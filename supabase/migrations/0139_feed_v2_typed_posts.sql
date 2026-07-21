-- 0139_feed_v2_typed_posts.sql — Feed v2: typed member posts (photo/video/ask/milestone/match),
-- the public feed-media bucket (images + ≤30s clips), and the create_match_post() seam that the
-- future ranked-result confirmation flow calls to auto-generate match reports. Idempotent.

-- ── 1) Typed posts ────────────────────────────────────────────────────────────
alter table public.posts add column if not exists post_type text not null default 'post';
alter table public.posts add column if not exists media_path text;
alter table public.posts add column if not exists media_duration_seconds int;
alter table public.posts add column if not exists milestone jsonb;
alter table public.posts add column if not exists match_summary jsonb;

do $$ begin
  alter table public.posts add constraint posts_post_type_check
    check (post_type in ('post','photo','video','ask','milestone','match'));
exception when duplicate_object then null; end $$;

-- Clips are capped at 30 seconds (31 allows rounding on the client probe).
do $$ begin
  alter table public.posts add constraint posts_media_duration_check
    check (media_duration_seconds is null or (media_duration_seconds >= 1 and media_duration_seconds <= 31));
exception when duplicate_object then null; end $$;

create index if not exists posts_type_created_idx on public.posts (post_type, created_at desc);

-- ── 2) feed-media bucket (mirrors the tournament-gallery pattern) ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feed-media', 'feed-media', true, 62914560,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create policy "feed_media_public_read" on storage.objects
    for select using (bucket_id = 'feed-media');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "feed_media_own_insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'feed-media' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "feed_media_own_delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'feed-media' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 3) Match-report seam ──────────────────────────────────────────────────────
-- Auto-posts a MATCH REPORT when a ranked result is confirmed. The result-capture
-- flow (rankings phase) calls this once; the caller must be a participant.
create or replace function public.create_match_post(
  p_match_id uuid,
  p_opponent text,
  p_score text,
  p_court text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sport text;
  v_name text;
  v_post_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select m.sport_key into v_sport from public.matches m where m.id = p_match_id;
  if v_sport is null then raise exception 'match not found'; end if;
  if not exists (
    select 1 from public.match_participants mp
    where mp.match_id = p_match_id and mp.user_id = v_uid
  ) then raise exception 'not a participant'; end if;
  if exists (
    select 1 from public.posts p
    where p.match_id = p_match_id and p.author_id = v_uid and p.post_type = 'match'
  ) then
    select p.id into v_post_id from public.posts p
    where p.match_id = p_match_id and p.author_id = v_uid and p.post_type = 'match' limit 1;
    return v_post_id; -- idempotent per author+match
  end if;
  select pr.display_name into v_name from public.profiles pr where pr.id = v_uid;
  insert into public.posts (author_id, author_type, post_type, body, sport_key, match_id, match_summary, moderation_status)
  values (
    v_uid, 'member', 'match', nullif(p_note, ''), v_sport, p_match_id,
    jsonb_build_object('winner', coalesce(v_name, 'Winner'), 'opponent', p_opponent, 'score', p_score, 'court', p_court),
    'approved'
  ) returning id into v_post_id;
  return v_post_id;
end $$;

revoke all on function public.create_match_post(uuid, text, text, text, text) from public;
grant execute on function public.create_match_post(uuid, text, text, text, text) to authenticated;
