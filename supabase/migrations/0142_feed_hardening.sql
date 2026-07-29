-- 0142_feed_hardening.sql — security-audit hardening for the social feed.
-- Findings fixed here, each enforced in the database (never only in the app):
--   (1) post_likes was readable with using(true) — anyone could enumerate every
--       like in the system, including activity on friends-only posts. Reads now
--       gate on post_visible(), same as comments always did.
--   (2) Blocked pairs: blocking now hides BOTH parties' posts from each other in
--       both directions, inside the RLS policy and post_visible() — previously
--       block filtering lived only in the feed page's application code.
--   (3) media_path grafting: "update own post" allowed an author to point
--       media_path at any string — including a path copied from someone else's
--       visible post — and the renderer would sign it. A CHECK now pins
--       media_path to the author's own storage folder, closing re-hosting of
--       other people's media (including republishing a friends-only photo).
--   (4) Composite indexes for the new app-layer rate limits (posts/comments per
--       author per hour) so abuse checks stay indexed at any scale.
-- Idempotent. Run after 0140 + 0141.

-- ── (1) likes are only visible where the post is ──────────────────────────────
drop policy if exists "likes readable" on public.post_likes;
create policy "likes readable" on public.post_likes
  for select to authenticated using (public.post_visible(post_id));

-- ── (2) blocks live in the visibility boundary itself ─────────────────────────
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts
  for select to authenticated using (
    author_id = auth.uid()
    or (
      moderation_status = 'approved'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = posts.author_id and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = posts.author_id)
      )
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

create or replace function public.post_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id
      and (
        p.author_id = auth.uid()
        or (
          p.moderation_status = 'approved'
          and not exists (
            select 1 from public.blocks b
            where (b.blocker_id = p.author_id and b.blocked_id = auth.uid())
               or (b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
          )
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

-- ── (3) media can only ever live in the author's own folder ───────────────────
do $$ begin
  alter table public.posts add constraint posts_media_path_owner_check
    check (media_path is null or media_path like author_id::text || '/%');
exception when duplicate_object then null; end $$;

-- ── (4) indexed abuse checks ──────────────────────────────────────────────────
create index if not exists posts_author_created_idx
  on public.posts (author_id, created_at desc);
create index if not exists post_comments_author_created_idx
  on public.post_comments (author_id, created_at desc);
