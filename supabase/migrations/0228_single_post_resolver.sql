-- 0228_single_post_resolver.sql — KCDX-038 (P1, part): Feed deep links are
-- unreliable.
--
-- `feed-post-card.tsx` builds `${origin}/feed?post=${post.id}` and copies it to
-- the clipboard. `feed/page.tsx` never reads `post`. So every share link anyone
-- has ever sent lands on the generic Feed — and because the Feed is ranked and
-- personalised, the recipient often cannot find the post at all: it may be
-- outside their circle, outside their area, or simply below the fold of a
-- different ranking.
--
-- Nothing errors. The sharer sees a link copied, the recipient sees a feed, and
-- neither has any reason to think the feature is broken. That combination is why
-- it survived.
--
-- ── WHY A RESOLVER RATHER THAN A FILTER ──────────────────────────────────
-- Reading `?post=` and filtering the ranked results would only work when the
-- post happens to be in them, which is the case that did not need fixing. The
-- post has to be fetched by id — and that fetch must answer three different
-- questions honestly:
--
--   · it does not exist, or was deleted
--   · it exists and you may not see it (audience, or a block)
--   · it exists and is awaiting moderation
--
-- A single "not found" for all three is the easy answer and the wrong one: it
-- tells someone whose friend shared a friends-only post that the post is gone,
-- and it tells a blocked person nothing distinguishable from a deleted post —
-- which is correct for the block and misleading for everything else.
--
-- The resolver returns a REASON. The caller decides how much of it to show; the
-- block case deliberately collapses into the generic unavailable state, because
-- distinguishing it would tell the blocked person they were blocked.

create or replace function public.resolve_feed_post(p_post uuid)
returns table (
  post_id  uuid,
  visible  boolean,
  reason   text,          -- 'ok' | 'not_found' | 'not_visible' | 'pending_review'
  author_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_p record;
begin
  select p.id, p.author_id, p.moderation_status, p.audience into v_p
    from public.posts p where p.id = p_post;

  if not found then
    return query select p_post, false, 'not_found'::text, null::uuid;
    return;
  end if;

  -- A blocked pair gets the same answer as a deleted post, on purpose: any
  -- distinguishable response tells the blocked person they were blocked.
  if public.is_blocked_pair(auth.uid(), v_p.author_id) then
    return query select p_post, false, 'not_found'::text, null::uuid;
    return;
  end if;

  if v_p.author_id = auth.uid() then
    -- Authors always reach their own posts, including while under review — the
    -- alternative is telling someone their own post has vanished.
    return query select v_p.id, true, 'ok'::text, v_p.author_id;
    return;
  end if;

  if v_p.moderation_status <> 'approved' then
    return query select v_p.id, false, 'pending_review'::text, v_p.author_id;
    return;
  end if;

  if not public.post_visible(v_p.id) then
    return query select v_p.id, false, 'not_visible'::text, v_p.author_id;
    return;
  end if;

  return query select v_p.id, true, 'ok'::text, v_p.author_id;
end;
$$;

revoke all on function public.resolve_feed_post(uuid) from public, anon;
grant execute on function public.resolve_feed_post(uuid) to authenticated, service_role;

comment on function public.resolve_feed_post is
  'KCDX-038: resolve a shared post by id, distinguishing deleted / not-yours-to-see / awaiting review. '
  'A blocked pair returns not_found deliberately — any distinguishable answer reveals the block.';
