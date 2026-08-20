-- 0195_video_disabled.sql — KCDX-006 (P0): unscreened, client-asserted video
-- can publish as approved.
--
-- WHAT THE PUBLISH PATH ACTUALLY DOES TODAY. `createPost` runs the image
-- classifier only for images. For a video it pushes the label
-- `media_unscreened` and pushes NO verdict — so `flagged` is false, `gateDown`
-- is false, and the status computes to **approved**. The label is a note to
-- ourselves, not a gate. Meanwhile the duration comes from a `<video>` element
-- in the browser and the content type comes from the upload request, so both
-- facts about the file are asserted by the client and never checked against the
-- bytes. Nothing in the pipeline has looked at a single frame.
--
-- This finding is NOT fixed here, and this migration does not claim to fix it.
-- The audit's disposition is FEATURE DISABLED as containment, and the finding
-- stays open until the real gate exists: server-side byte and type validation,
-- duration and codec probing from the file itself, a moderation policy for
-- moving images, private staging with derivatives, captions, quotas, cleanup,
-- and hostile-file tests.
--
-- WHAT THIS DOES DO is make "disabled" true at the boundary rather than in the
-- interface. Removing a tab from the composer stops the honest user. It does not
-- stop a POST to the server action, and it does not stop a signed upload. Two
-- locks, in the two places that actually decide:
--
--   1. Storage will not accept the bytes — video MIME types leave the
--      `feed-media` allowlist, so the upload fails at the Storage API even with
--      a valid signed URL.
--   2. Postgres will not accept the row — a trigger rejects `post_type =
--      'video'` and any `media_duration_seconds`, whatever route the write
--      arrives by.
--
-- RE-ENABLING IS DELIBERATELY TWO STEPS, in the migration that ships the gate:
-- drop `posts_reject_video` and restore the three MIME types. Neither is a
-- dashboard toggle, and neither happens by accident.

-- ── 1. Storage will not take the bytes ────────────────────────────────────
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
 where id = 'feed-media';

-- ── 2. Postgres will not take the row ─────────────────────────────────────
create or replace function public.reject_video_posts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.post_type = 'video' or new.media_duration_seconds is not null then
    raise exception 'video posts are disabled (KCDX-006: no server-side media safety gate yet)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- DELETE THIS TRIGGER in the migration that ships the safe-media gate. It is
-- named so `grep -rn posts_reject_video` finds every reference at that point.
drop trigger if exists posts_reject_video on public.posts;
create trigger posts_reject_video
  before insert or update on public.posts
  for each row execute function public.reject_video_posts();

-- ── 3. anything already published ─────────────────────────────────────────
-- Video that got in before the door closed is unscreened by definition. It goes
-- back to pending, which also withdraws it from the Feed via 0194's widened
-- `feed_post` trigger. Nothing is deleted: the author's content is theirs, and
-- a human decision about it belongs to moderation, not to a migration.
update public.posts
   set moderation_status = 'pending',
       moderation_labels = coalesce(moderation_labels, '{}') || array['media_unscreened','video_disabled']
 where post_type = 'video'
   and moderation_status = 'approved';

-- ── 4. the flag the interface reads ───────────────────────────────────────
-- This is for the composer, so it can stop offering something that will fail.
-- It is NOT the boundary and must never be mistaken for one: flipping this row
-- re-enables a tab, and the trigger above will still refuse the post.
insert into public.feature_flags (key, enabled, note)
values ('feed_video', false,
        'KCDX-006: video publishing is off until the server-side media safety gate exists. '
        'This flag controls the composer only — the boundary is the posts_reject_video trigger '
        'and the feed-media MIME allowlist.')
on conflict (key) do update
  set enabled = false, note = excluded.note, updated_at = now();

-- ── 5. keep it closed ─────────────────────────────────────────────────────
create or replace function public.video_disabled_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'posts'
         and t.tgname = 'posts_reject_video' and not t.tgisinternal and t.tgenabled <> 'D'
    )
    and not exists (
      select 1 from storage.buckets
       where id = 'feed-media'
         and allowed_mime_types && array['video/mp4','video/webm','video/quicktime']
    );
$$;

revoke all on function public.video_disabled_intact() from public, anon, authenticated;
grant execute on function public.video_disabled_intact() to service_role;
