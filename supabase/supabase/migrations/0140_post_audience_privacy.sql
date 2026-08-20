-- 0140_post_audience_privacy.sql — per-post privacy, enforced in the database.
-- audience: 'public' (everyone) · 'followers' (friends + your followers) ·
-- 'friends' (accepted friendships only). Authors always see their own posts,
-- whatever the status — that alone fixes "my post vanished". The feed-media
-- bucket goes private (signed URLs only), and the wire trigger stops emitting
-- non-public member posts. Idempotent.

-- ── 1) audience column ────────────────────────────────────────────────────────
alter table public.posts add column if not exists audience text not null default 'public';

do $$ begin
  alter table public.posts add constraint posts_audience_check
    check (audience in ('public','followers','friends'));
exception when duplicate_object then null; end $$;

-- ── 2) visibility: one canonical SELECT policy ────────────────────────────────
-- friendships/follows are indexed pair lookups (0099), so this stays O(1) per row.
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts
  for select to authenticated using (
    author_id = auth.uid()
    or (
      moderation_status = 'approved'
      and (
        audience = 'public'
        or (
          audience in ('friends','followers')
          and exists (
            select 1 from public.friendships f
            where f.status = 'accepted'
              and ((f.requester_id = auth.uid() and f.addressee_id = posts.author_id)
                or (f.addressee_id = auth.uid() and f.requester_id = posts.author_id))
          )
        )
        or (
          audience = 'followers'
          and exists (
            select 1 from public.follows fo
            where fo.follower_id = auth.uid() and fo.followee_id = posts.author_id
          )
        )
      )
    )
  );

-- post_visible() gates media/likes/comments reads (SECURITY DEFINER — restate
-- the audience rules explicitly so nothing leaks around a hidden post).
create or replace function public.post_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id
      and (
        p.author_id = auth.uid()
        or (
          p.moderation_status = 'approved'
          and (
            p.audience = 'public'
            or (
              p.audience in ('friends','followers')
              and exists (
                select 1 from public.friendships f
                where f.status = 'accepted'
                  and ((f.requester_id = auth.uid() and f.addressee_id = p.author_id)
                    or (f.addressee_id = auth.uid() and f.requester_id = p.author_id))
              )
            )
            or (
              p.audience = 'followers'
              and exists (
                select 1 from public.follows fo
                where fo.follower_id = auth.uid() and fo.followee_id = p.author_id
              )
            )
          )
        )
      )
  );
$$;

-- ── 3) the wire only ever carries PUBLIC member posts ─────────────────────────
create or replace function public.feed_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare z text;
begin
  if tg_op = 'DELETE' then
    delete from public.feed_items where object_kind = 'post' and object_id = old.id;
    return null;
  end if;
  if new.moderation_status = 'approved' and new.audience = 'public'
     and (tg_op = 'INSERT' or old.moderation_status is distinct from 'approved') then
    select home_zip into z from public.profiles where id = new.author_id;
    if z is not null and new.body is not null then
      perform public.feed_emit('member_post', new.author_id, z, 'post', new.id,
        jsonb_build_object('body', left(new.body, 500)),
        'member_post:' || new.id, 'region', new.sport_key);
    end if;
  elsif tg_op = 'UPDATE' and (new.moderation_status <> 'approved' or new.audience <> 'public')
        and old.moderation_status = 'approved' then
    delete from public.feed_items where object_kind = 'post' and object_id = new.id;
  end if;
  return null;
end $$;

-- ── 4) feed-media goes private — signed URLs only ─────────────────────────────
update storage.buckets set public = false where id = 'feed-media';
drop policy if exists "feed_media_public_read" on storage.objects;
