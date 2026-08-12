-- 0243_storage_deletion_outbox.sql — makes object deletion actually delete the
-- bytes, and stops one post's deletion breaking another post's media.
--
-- KRA-011 + KRA-030 (P1/P2, re-audit 2026-08-10).
--
-- KRA-011. 0224 cleans up Feed media with `delete from storage.objects` — both in
-- `purge_orphan_feed_media()` and in the `posts_delete_media` trigger. Supabase's
-- own Storage documentation is explicit that removing the metadata row does NOT
-- remove the underlying object; deletion goes through the Storage API. So the
-- catalog row disappeared, the application believed cleanup had succeeded, and the
-- billed bytes stayed — no longer discoverable by `storage_manifest_verify()`
-- (0226), which reconciles against `storage.objects` and therefore could not see
-- what it had just been made blind to.
--
-- The member-facing version of that is worse than the invoice: an object a member
-- believes they deleted is gone from every surface and still fetchable by anyone
-- holding a signed URL.
--
-- A migration cannot call the Storage API — the same limit 0226 ran into and
-- recorded rather than pretended around. So the database records the INTENT
-- durably and a worker performs it, with the result written back. Cleanup is
-- complete when the API says so, not when a row vanishes.
--
-- KRA-030. `media_path` is only required to begin with the author's id and is not
-- unique (0142), so one owner can legally attach one path to two posts through the
-- API. `delete_post_media` removed the path referenced by the deleted post without
-- checking whether anything else still pointed at it, which breaks the surviving
-- post. Enqueueing now happens only when the last reference goes.

create table if not exists public.storage_deletions (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text not null,
  object_path  text not null,
  reason       text not null,
  requested_at timestamptz not null default now(),
  attempts     int not null default 0,
  last_error   text,
  deleted_at   timestamptz,
  unique (bucket_id, object_path)
);

create index if not exists storage_deletions_pending_idx
  on public.storage_deletions (requested_at)
  where deleted_at is null;

alter table public.storage_deletions enable row level security;
revoke all on public.storage_deletions from anon, authenticated;
grant all on public.storage_deletions to service_role;

comment on table public.storage_deletions is
  'KRA-011: durable intent to delete a Storage OBJECT. A migration cannot call the Storage API, and '
  'deleting the storage.objects row leaves the bytes — so the intent is recorded here and a worker '
  'performs it, writing back the result. Cleanup is complete when the API confirms, not before.';

-- ── enqueue helper ────────────────────────────────────────────────────────
create or replace function public.enqueue_storage_deletion(
  p_bucket text,
  p_path   text,
  p_reason text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.storage_deletions (bucket_id, object_path, reason)
  values (p_bucket, p_path, p_reason)
  on conflict (bucket_id, object_path) do nothing;
$$;

revoke all on function public.enqueue_storage_deletion(text, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_storage_deletion(text, text, text) to service_role;

-- ── the post-delete trigger stops lying ──────────────────────────────────
-- Enqueues instead of deleting the catalog row, and only when the path has no
-- remaining referent (KRA-030). Evidence objects are still skipped: a
-- safety_incident outlives the post it came from by design.
create or replace function public.delete_post_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.media_path is null then
    return old;
  end if;

  -- Another post of the same owner may legitimately reference this path, because
  -- `media_path` is not unique. Deleting on the first post's removal took the
  -- second post's image with it.
  if exists (
    select 1 from public.posts p
     where p.media_path = old.media_path and p.id <> old.id
  ) then
    return old;
  end if;

  -- Preserved safety evidence is never collected.
  if exists (
    select 1 from public.safety_incidents s where s.storage_path = old.media_path
  ) then
    return old;
  end if;

  perform public.enqueue_storage_deletion('feed-media', old.media_path, 'post_deleted');
  return old;
end $$;

-- ── the nightly orphan purge stops lying too ─────────────────────────────
-- The signature MUST match 0224's, which takes `p_grace_hours integer default 24`.
-- My first draft declared this with no arguments, which does not replace that
-- function — it ADDS an overload. The original survived, still carrying
-- `delete from storage.objects`, and the nightly cron entry
-- (`select public.purge_orphan_feed_media()`) would have kept calling the
-- vulnerable one while this clean copy sat beside it doing nothing. That is the
-- 0214 lesson exactly: a differing argument list adds a signature rather than
-- replacing one, and the survivor is the dangerous one.
--
-- Worse, my sentinel used `limit 1` with no ORDER BY over the two rows and
-- happened to pick the clean one, so it reported PASS. A check that samples one
-- of several overloads is not a check.
drop function if exists public.purge_orphan_feed_media();

create or replace function public.purge_orphan_feed_media(p_grace_hours integer default 24)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int := 0;
begin
  -- Same 24h grace period as 0224: long enough that a composition in progress is
  -- never collected, which is the difference between a garbage collector and a
  -- race with the person typing.
  insert into public.storage_deletions (bucket_id, object_path, reason)
  select 'feed-media', o.name, 'orphan_purge'
    from storage.objects o
   where o.bucket_id = 'feed-media'
     and o.created_at < now() - make_interval(hours => greatest(coalesce(p_grace_hours, 24), 1))
     and not exists (select 1 from public.posts p where p.media_path = o.name)
     and not exists (select 1 from public.post_media m where m.storage_path = o.name)
     and not exists (select 1 from public.safety_incidents s where s.storage_path = o.name)
  on conflict (bucket_id, object_path) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.purge_orphan_feed_media(integer) from public, anon, authenticated;
grant execute on function public.purge_orphan_feed_media(integer) to service_role;

-- ── what proves the work HAPPENED, not that it was invoked ───────────────
-- The canary measures ABSENCE: intents that have been sitting unperformed. A
-- worker that stops running produces exactly this signature and no exception.
create or replace function public.storage_deletions_stuck()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.storage_deletions
   where deleted_at is null and requested_at < now() - interval '6 hours';
$$;

revoke all on function public.storage_deletions_stuck() from public, anon, authenticated;
grant execute on function public.storage_deletions_stuck() to service_role;

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.storage_deletion_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- NO cleanup function of either name may delete the catalog row and call it
    -- done — asserted across every overload, because `limit 1` over two rows is
    -- a sample, not a check, and it passed on the wrong one.
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('delete_post_media', 'purge_orphan_feed_media')
         and position('delete from storage.objects' in pg_get_functiondef(p.oid)) > 0
    )
    -- and the shared-path guard is present
    and (select position('p.id <> old.id' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'delete_post_media' limit 1)
    and not has_table_privilege('authenticated', 'public.storage_deletions', 'SELECT');
$$;

revoke all on function public.storage_deletion_intact() from anon, authenticated, public;
grant execute on function public.storage_deletion_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 24)
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
