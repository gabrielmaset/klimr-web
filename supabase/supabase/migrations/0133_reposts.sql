-- 0133_reposts.sql — the repost model: a post referencing another post.
-- Mechanics only (display naming waits on open decisions): one repost per
-- member per original (unique partial index → toggle is deterministic),
-- no repost-of-repost (trigger, mirroring the comment-depth pattern),
-- originals must be published, and deleting the original cascades its
-- reposts away — no ghost content. feed_on_post becomes repost-aware:
-- an empty-body repost still emits a card, carrying repost_of in the
-- payload so the feed can render the original inline.

alter table public.posts
  add column if not exists repost_of uuid references public.posts(id) on delete cascade;

create index if not exists posts_repost_of_idx
  on public.posts (repost_of) where repost_of is not null;

create unique index if not exists posts_one_repost_per_author
  on public.posts (author_id, repost_of) where repost_of is not null;

create or replace function public.enforce_repost_rules()
returns trigger language plpgsql as $$
declare v_parent_repost uuid; v_parent_status public.moderation_status;
begin
  if new.repost_of is not null then
    select repost_of, moderation_status into v_parent_repost, v_parent_status
    from posts where id = new.repost_of;
    if not found then
      raise exception 'repost_missing' using errcode = '23503';
    end if;
    if v_parent_repost is not null then
      raise exception 'repost_of_repost' using errcode = '23514';
    end if;
    if v_parent_status <> 'approved' then
      raise exception 'repost_unpublished' using errcode = '23514';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists posts_repost_rules on public.posts;
create trigger posts_repost_rules before insert on public.posts
  for each row execute function public.enforce_repost_rules();

-- repost-aware feed emission (replaces the 0112 version)
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
  if new.moderation_status = 'approved' and (tg_op = 'INSERT' or old.moderation_status is distinct from 'approved') then
    select home_zip into z from public.profiles where id = new.author_id;
    if z is not null and (new.body is not null or new.repost_of is not null) then
      perform public.feed_emit('member_post', new.author_id, z, 'post', new.id,
        jsonb_strip_nulls(jsonb_build_object(
          'body', left(coalesce(new.body, ''), 500),
          'repost_of', new.repost_of)),
        'member_post:' || new.id, 'region', new.sport_key);
    end if;
  elsif tg_op = 'UPDATE' and new.moderation_status <> 'approved' and old.moderation_status = 'approved' then
    delete from public.feed_items where object_kind = 'post' and object_id = new.id;
  end if;
  return null;
end $$;
