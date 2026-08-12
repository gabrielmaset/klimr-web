-- 0247_deep_link_non_enumeration.sql — one answer for every denial, and no author
-- id for a post the caller may not see.
--
-- KRA-026 (P2, re-audit 2026-08-10). 0228 collapsed the BLOCK case into
-- `not_found`, which was right, and then left three other distinguishable
-- answers standing:
--
--   · moderation is checked BEFORE audience, so a member with no relationship to
--     a private post learns it is `pending_review` — i.e. that the post exists,
--     who wrote it, and where it sits in moderation;
--   · an approved post the caller may not see returns `not_visible` **plus
--     `author_id`**, which is the identity the audience rule exists to protect;
--   · `not_found` and the two above are separable, so a caller holding a UUID can
--     tell "no such post" from "a post you cannot see".
--
-- Collapsing only the block case protects the blocked person and nobody else. Any
-- distinguishable answer is an existence oracle, and a UUID from an old share link
-- or a notification is exactly what an attacker has.
--
-- OWNER DECISION OD-3 (2026-08-10): collapse. And where a post is hidden by a
-- block or a restriction it must not appear at all — no card, no note, no
-- explanation. That second half is the FEED PAGE's job and ships with this
-- migration's code batch; this function stops supplying the material.
--
-- What survives, and why it is not the same leak:
--   · the AUTHOR still gets `ok` on their own post, including under review.
--     Telling someone their own post has vanished is a worse failure than the
--     information it withholds, and they already know it exists.
--   · `pending_review` survives for the author only, so the composer can explain
--     why their post is not public yet.

create or replace function public.resolve_feed_post(p_post uuid)
returns table (
  post_id  uuid,
  visible  boolean,
  reason   text,          -- 'ok' | 'unavailable' | 'pending_review' (author only)
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

  -- Absent post: the generic answer, and no author.
  if not found then
    return query select p_post, false, 'unavailable'::text, null::uuid;
    return;
  end if;

  -- AUTHOR FIRST. Everything below this point is about somebody else's post, and
  -- putting the author check first means the collapse cannot accidentally hide a
  -- member's own content from them.
  if v_p.author_id = auth.uid() then
    if v_p.moderation_status <> 'approved' then
      return query select v_p.id, false, 'pending_review'::text, v_p.author_id;
      return;
    end if;
    return query select v_p.id, true, 'ok'::text, v_p.author_id;
    return;
  end if;

  -- One answer for every other refusal — blocked, restricted, wrong audience,
  -- awaiting review, rejected, absent. `author_id` is withheld: it is the very
  -- identity the audience rule protects, and returning it alongside a denial
  -- hands over the thing being denied.
  if public.is_blocked_pair(auth.uid(), v_p.author_id)
     or v_p.moderation_status <> 'approved'
     or not public.post_visible(v_p.id) then
    return query select p_post, false, 'unavailable'::text, null::uuid;
    return;
  end if;

  return query select v_p.id, true, 'ok'::text, v_p.author_id;
end $$;

revoke all on function public.resolve_feed_post(uuid) from public, anon;
grant execute on function public.resolve_feed_post(uuid) to authenticated, service_role;

comment on function public.resolve_feed_post is
  'KRA-026 / OD-3: resolves a Feed deep link. Every refusal returns the SAME reason and NO author id, '
  'so a caller holding a UUID cannot distinguish absent from private from pending. The author is the '
  'one exception — they may always reach their own post, and already know it exists.';

create or replace function public.deep_link_non_enumeration_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the distinguishable refusals are gone
    (select position('not_visible' in pg_get_functiondef(p.oid)) = 0
        and position('''not_found''' in pg_get_functiondef(p.oid)) = 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'resolve_feed_post' limit 1)
    -- and anon cannot call it at all
    and not has_function_privilege('anon', 'public.resolve_feed_post(uuid)', 'EXECUTE');
$$;

revoke all on function public.deep_link_non_enumeration_intact() from public, anon, authenticated;
grant execute on function public.deep_link_non_enumeration_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 27)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
