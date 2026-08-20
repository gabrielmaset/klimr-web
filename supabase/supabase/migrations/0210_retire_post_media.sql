-- 0210_retire_post_media.sql — KCDX-059 (P2): legacy `post-media` stayed
-- publicly readable after the Feed moved to a private bucket.
--
-- 0006 created `post-media` as a PUBLIC bucket with an `anon` read policy, no
-- size limit and no MIME allowlist. 0140 privatised `feed-media` — the bucket
-- the Feed actually uses now — and nothing ever went back for the old one.
--
-- The current state, read from the database rather than inferred:
--
--   post-media  public=true   size=NULL  mime=NULL   policy: anon + authenticated SELECT
--   feed-media  public=false  size=60MB  mime=4 types
--
-- And **no application code references `post-media` at all**. Post media is
-- served from `feed-media` through `createSignedUrls` in app/feed/page.tsx. So
-- every object still sitting in the old bucket is member-uploaded content that
-- nothing renders, that no one can find through the product, and that anyone
-- holding or guessing a URL can fetch — indefinitely, because a public bucket
-- has no expiry.
--
-- ── WHAT THIS MIGRATION DOES, AND DELIBERATELY DOES NOT ──────────────────
-- It closes the access. It does not delete anything.
--
-- Deleting bytes is not a migration's decision. The audit asks for an inventory
-- of live objects against rows, migration of anything still referenced, and
-- removal of verified orphans under a recovery plan — and the first of those
-- cannot be done from a migration file, because only production knows what is
-- in the bucket. `post_media_inventory()` below answers it in one query, and the
-- deletion happens afterwards as a deliberate act with the answer in hand.
--
-- Closing first and inventorying second is the right order: the exposure stops
-- today, and nothing is destroyed before anyone has looked.

-- ── 1. stop the public read ───────────────────────────────────────────────
update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
 where id = 'post-media';

drop policy if exists "post-media public read" on storage.objects;

-- Service role keeps access — the inventory below needs it, and so does any
-- future migration of referenced objects into `feed-media`.

-- ── 2. the inventory the retirement decision needs ────────────────────────
-- Run this in the SQL editor before deciding what to delete. It reports, for
-- every object left in the bucket, whether any post row still points at that
-- path — which is the only question that matters for whether it can go.
create or replace function public.post_media_inventory()
returns table (
  storage_path   text,
  size_bytes     bigint,
  uploaded_at    timestamptz,
  still_referenced boolean,
  referencing_post uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.name,
    (o.metadata->>'size')::bigint,
    o.created_at,
    p.id is not null,
    p.id
  from storage.objects o
  left join public.posts p on p.media_path = o.name
  where o.bucket_id = 'post-media'
  order by (p.id is not null) desc, o.created_at;
$$;

revoke all on function public.post_media_inventory() from public, anon, authenticated;
grant execute on function public.post_media_inventory() to service_role;

comment on function public.post_media_inventory is
  'KCDX-059: what is left in the retired post-media bucket, and whether any post still points at it. '
  'Run before deleting anything — a migration cannot know what production holds.';

-- ── 3. keep it closed ─────────────────────────────────────────────────────
create or replace function public.legacy_media_retired()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (select 1 from storage.buckets where id = 'post-media' and public)
    and not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'post-media public read'
    );
$$;

revoke all on function public.legacy_media_retired() from public, anon, authenticated;
grant execute on function public.legacy_media_retired() to service_role;
