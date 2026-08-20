-- 0132_feed_groundwork.sql — decision-independent Feed 2.0 foundations:
-- (1) posts.author_type polymorphism ('user' now, 'business' when business
--     accounts land — either outcome of the providers-merge decision uses it);
-- (2) one-level comment replies: parent_comment_id + a BEFORE INSERT trigger
--     enforcing the confirmed flat+one-reply shape (parent must be a root
--     comment on the same post). App code validates first for friendly errors;
--     the trigger is the backstop that makes deeper nesting impossible.
-- Likes, moderation triggers, RLS, and the feed-emit trigger are untouched.

alter table public.posts
  add column if not exists author_type text not null default 'user'
    check (author_type in ('user','business'));

alter table public.post_comments
  add column if not exists parent_comment_id uuid
    references public.post_comments(id) on delete cascade;

create index if not exists post_comments_thread_idx
  on public.post_comments (post_id, parent_comment_id, created_at)
  where moderation_status = 'approved';

create or replace function public.enforce_comment_reply_depth()
returns trigger language plpgsql as $$
declare v_post uuid; v_parent uuid;
begin
  if new.parent_comment_id is not null then
    select post_id, parent_comment_id into v_post, v_parent
    from post_comments where id = new.parent_comment_id;
    if not found then
      raise exception 'parent_missing' using errcode = '23503';
    end if;
    if v_parent is not null then
      raise exception 'reply_depth' using errcode = '23514';
    end if;
    if v_post <> new.post_id then
      raise exception 'parent_wrong_post' using errcode = '23514';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists post_comments_reply_depth on public.post_comments;
create trigger post_comments_reply_depth before insert on public.post_comments
  for each row execute function public.enforce_comment_reply_depth();
