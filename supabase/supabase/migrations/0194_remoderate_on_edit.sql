-- 0194_remoderate_on_edit.sql — KCDX-005 (P0): approved Feed posts can be
-- changed without re-moderation.
--
-- THE HOLE. `guard_moderation_update` already stops an author from setting their
-- own `moderation_status` — that door is shut. The one next to it is wide open:
-- nothing stops the author from changing the CONTENT while the status stays
-- 'approved'. Post something benign, wait for approval, then PATCH the body.
-- The moderation record still says approved, the Feed still shows it, and what
-- it now says was never screened by anything.
--
-- Every safety claim the product makes about the Feed rests on "approved means
-- someone looked at this". An edit after approval makes that sentence false, and
-- no amount of UI discipline fixes it, because the edit is one REST call.
--
-- THE FIX, and why it is a trigger. The requirement is atomic: the moment the
-- content changes, the approval must stop applying — not on the next job run,
-- not when a server action remembers to reset it. A BEFORE UPDATE trigger is the
-- only place where "the new content" and "the status that describes it" can be
-- decided in the same statement, whatever route the write arrives by.
--
-- The withdrawal from published projections comes free: `feed_on_post` already
-- deletes the `feed_items` row when a post leaves 'approved', so flipping the
-- status back is enough to pull it from the Feed in the same transaction.
--
-- ONE DELIBERATE EXEMPTION. If the caller explicitly sets a new
-- `moderation_status` in the same statement, that is respected — that is the
-- re-screening pipeline saying "I have looked at this new content and here is my
-- verdict". The author cannot use this door, because `guard_moderation_update`
-- has already rewritten their attempted status back to the old value before this
-- trigger runs (hence the name, which sorts after it).

-- ── 1. posts ───────────────────────────────────────────────────────────────
create or replace function public.remoderate_post_on_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only content matters here. `audience` is deliberately excluded: narrowing or
  -- widening who sees a post does not change what the post says, and
  -- `feed_on_post` already withdraws it from the public projection when the
  -- audience stops being public.
  if old.moderation_status = 'approved'
     and new.moderation_status is not distinct from old.moderation_status
     and (
          new.body                   is distinct from old.body
       or new.media_path             is distinct from old.media_path
       or new.media_duration_seconds is distinct from old.media_duration_seconds
       or new.milestone              is distinct from old.milestone
       or new.match_summary          is distinct from old.match_summary
       or new.post_type              is distinct from old.post_type
       or new.repost_of              is distinct from old.repost_of
     )
  then
    new.moderation_status := 'pending';
    -- Labels described the OLD content. Keeping them would let a stale "clean"
    -- verdict follow the new text around.
    new.moderation_labels := null;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_remoderate_on_edit on public.posts;
create trigger posts_remoderate_on_edit
  before update on public.posts
  for each row execute function public.remoderate_post_on_edit();

-- ── 2. comments ────────────────────────────────────────────────────────────
create or replace function public.remoderate_comment_on_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.moderation_status = 'approved'
     and new.moderation_status is not distinct from old.moderation_status
     and new.body is distinct from old.body
  then
    new.moderation_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_remoderate_on_edit on public.post_comments;
create trigger post_comments_remoderate_on_edit
  before update on public.post_comments
  for each row execute function public.remoderate_comment_on_edit();

-- ── 3. attached media ──────────────────────────────────────────────────────
-- Same hole, different door: `post_media` carries its own insert/delete policies
-- bound to the author, so an approved post can gain an image it was never
-- approved with — without the post row changing at all.
create or replace function public.remoderate_post_on_media_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
     set moderation_status = 'pending', moderation_labels = null
   where id = v_post and moderation_status = 'approved';
  return coalesce(new, old);
end;
$$;

drop trigger if exists post_media_remoderate_parent on public.post_media;
create trigger post_media_remoderate_parent
  after insert or delete on public.post_media
  for each row execute function public.remoderate_post_on_media_change();

-- ── 5. two pre-existing defects this fix depends on ───────────────────────
--
-- (a) The Feed withdrawal never fired for an edit. `feed_post` was declared
--     `AFTER UPDATE OF moderation_status`, and Postgres decides that from the
--     columns NAMED in the SET clause — not from whether the value changed. An
--     author's `update posts set body = …` does not mention moderation_status,
--     so the trigger stayed silent even though a BEFORE trigger had just moved
--     the post back to pending. The post left moderation and stayed in the Feed:
--     precisely the outcome KCDX-005 is about, reached by a different route.
--     Widening it to any UPDATE costs one cheap early-exit per post edit; posts
--     are not a hot write path, and the function returns immediately unless the
--     status actually crosses the approved line.
drop trigger if exists feed_post on public.posts;
create trigger feed_post
  after insert or delete or update on public.posts
  for each row execute function public.feed_on_post();

-- (b) `guard_moderation_update` reverts any status change from a caller that is
--     not literally `service_role`. Inside a SECURITY DEFINER trigger the
--     current_user is the definer, so the guard was silently undoing the media
--     re-moderation above. The guard exists to stop CLIENT writes, so it now
--     only applies at trigger depth 1 — a direct statement. A change originating
--     inside another trigger (depth ≥ 2) is our own machinery and is trusted;
--     there is no path for a client to reach that depth without going through
--     one of our triggers first.
create or replace function public.guard_moderation_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and current_user <> 'service_role'
     and pg_trigger_depth() <= 1 then
    new.moderation_status := old.moderation_status;
  end if;
  return new;
end;
$$;

-- ── 6. keep it closed ─────────────────────────────────────────────────────
-- A trigger is easy to drop and impossible to notice missing. The boot sentinel
-- asks whether all three are present and enabled.
create or replace function public.moderation_reentry_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) = 3
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not t.tgisinternal
     and t.tgenabled <> 'D'
     and t.tgname in ('posts_remoderate_on_edit',
                      'post_comments_remoderate_on_edit',
                      'post_media_remoderate_parent');
$$;

revoke all on function public.moderation_reentry_intact() from public, anon, authenticated;
grant execute on function public.moderation_reentry_intact() to service_role;
