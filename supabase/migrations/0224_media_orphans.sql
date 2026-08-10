-- 0224_media_orphans.sql — KCDX-035 (P1): failed Feed creation and ordinary
-- deletion orphan media.
--
-- The composer uploads the file FIRST, then creates the post. That order is
-- right — you cannot attach a path you have not written — but it means every
-- abandoned composition leaves an object behind: the upload succeeds, the person
-- changes their mind or the post creation fails, and the bytes stay in
-- `feed-media` forever with nothing pointing at them.
--
-- Deletion has the mirror problem. `deleteOwnPost` removes the row. The object
-- survives. Only moderation REJECTION removes media, so the one path that
-- reliably cleans up is the one nobody wants to be on.
--
-- ── WHY THIS IS MORE THAN HOUSEKEEPING ───────────────────────────────────
-- An orphaned object is content a member believes they deleted. The row is gone
-- from every surface, the person has every reason to think it is gone, and the
-- bytes are still there — reachable by anyone holding or reconstructing a signed
-- URL, and still counted in whatever storage bill and legal exposure the account
-- carries. "Delete" that leaves the file is a promise the product does not keep.
--
-- ── THE GRACE PERIOD IS THE WHOLE DESIGN ─────────────────────────────────
-- A purge that runs immediately would delete the object of a post being composed
-- right now — uploaded, not yet submitted. So unreferenced objects are only
-- collected after 24 hours, which is far longer than any composition and far
-- shorter than "forever". The window is the difference between a garbage
-- collector and a race with the person typing.

create or replace function public.purge_orphan_feed_media(p_grace_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer := 0;
begin
  with orphans as (
    select o.id
      from storage.objects o
     where o.bucket_id = 'feed-media'
       and o.created_at < now() - make_interval(hours => greatest(p_grace_hours, 1))
       -- Nothing points at it. Both reference columns are checked: a post's own
       -- `media_path` and any attached `post_media` row.
       and not exists (select 1 from public.posts p where p.media_path = o.name)
       and not exists (select 1 from public.post_media m where m.storage_path = o.name)
       -- And it is not evidence. A safety incident's preserved object outlives
       -- the post it came from BY DESIGN, and a collector that cannot tell the
       -- difference between litter and evidence is worse than no collector.
       and not exists (select 1 from public.safety_incidents s where s.storage_path = o.name)
  )
  delete from storage.objects o using orphans x where o.id = x.id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    raise notice 'purge_orphan_feed_media: removed % unreferenced object(s)', v_deleted;
  end if;
  return v_deleted;
end;
$$;

revoke all on function public.purge_orphan_feed_media(integer) from public, anon, authenticated;
grant execute on function public.purge_orphan_feed_media(integer) to service_role;

comment on function public.purge_orphan_feed_media is
  'KCDX-035: removes feed-media objects nothing references, after a grace period long enough that a '
  'post being composed right now is never collected. Skips objects preserved as safety evidence.';

-- ── deleting a post takes its media with it ──────────────────────────────
-- The purge is the safety net; this is the intent. A member who deletes a post
-- should not have to wait a day for the file to follow, and relying on the
-- collector for the ordinary case would make its grace period load-bearing.
create or replace function public.delete_post_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Evidence is exempt here too: a post removed after a report still has to be
  -- reconstructable by whoever reviews the report.
  delete from storage.objects o
   where o.bucket_id = 'feed-media'
     and (o.name = old.media_path
          or o.name in (select storage_path from public.post_media where post_id = old.id))
     and not exists (select 1 from public.safety_incidents s where s.storage_path = o.name);
  return old;
end;
$$;

drop trigger if exists posts_delete_media on public.posts;
create trigger posts_delete_media
  before delete on public.posts
  for each row execute function public.delete_post_media();

-- Nightly, in-database, for the same reason as 0207: this is pure SQL and an
-- HTTP cron route is one middleware misclassification away from never running.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      perform cron.unschedule('klimr-purge-orphan-media');
    exception when others then null;
    end;
    perform cron.schedule('klimr-purge-orphan-media', '25 4 * * *', 'select public.purge_orphan_feed_media()');
  end if;
end $$;
