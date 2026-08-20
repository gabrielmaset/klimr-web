-- 0199_media_and_evidence_integrity.sql — KCDX-014 and KCDX-015 (P1).
--
-- KCDX-014 — WHY THIS MATTERS MORE NOW. The decision of record is that
-- prohibited-content screening is delegated to a third-party provider, for
-- photos as well as video. That claim is only true if every byte reaches the
-- screener, and today it does not have to: `feed-media`, `avatars`,
-- `listing-photos` and `credential-docs` each carry an own-folder INSERT policy,
-- so a member can PUT an object with nothing but their own JWT. The server
-- action that checks type, enforces the 30-uploads-per-hour ceiling and calls
-- the CSAM hash-match seam is simply not on that path.
--
-- A scanning vendor with a bypass is not a control; it is an expense. So the
-- member INSERT policies go, and the server mints a scoped signed-upload token
-- after its checks — which is already how `business-docs`, `tournament-gallery`
-- and event covers work. This makes those four buckets consistent with the three
-- that were right.
--
-- KCDX-015 — evidence that can change after it is judged. `credential-docs`,
-- `business-docs` and `tournament-payments` let the submitter UPDATE or DELETE
-- the object at the path a reviewer already approved. The decision row still
-- says "verified" and points at bytes that are now something else. That is not a
-- theoretical ordering problem: it is the ordinary shape of "get approved with a
-- real document, then replace it". UPDATE and DELETE go; INSERT stays, because
-- submitting NEW evidence is legitimate and appends rather than rewrites.
--
-- Deletion of evidence becomes a service-role operation, which is correct — a
-- retention or legal-hold decision belongs to staff and should leave a record,
-- not happen because someone tidied their uploads.

-- ── 1. bucket-level limits where there were none ──────────────────────────
-- The app checked size and type in TypeScript. That check is on the path this
-- migration is closing, so the bucket has to carry it too.
update storage.buckets
   set file_size_limit = 5242880,   -- 5 MiB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'listing-photos';

update storage.buckets
   set file_size_limit = 10485760,  -- 10 MiB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'credential-docs';

-- ── 2. uploads go through the server that screens them ────────────────────
-- Dropping the member INSERT/UPDATE policies does not break uploading: a signed
-- upload token minted by the service role carries its own authorization and does
-- not consult these policies. It breaks uploading *without asking us first*,
-- which is the point.
drop policy if exists "feed_media_own_insert"        on storage.objects;
drop policy if exists "avatars insert own"           on storage.objects;
drop policy if exists "avatars update own"           on storage.objects;
drop policy if exists "avatars: owner insert"        on storage.objects;
drop policy if exists "avatars: owner update"        on storage.objects;
drop policy if exists "listing photos owner insert"  on storage.objects;
drop policy if exists "listing photos owner update"  on storage.objects;
drop policy if exists "credential docs insert own"   on storage.objects;
-- `business-docs` is already minted by the service role in app/business/actions.ts,
-- so this member INSERT policy has been redundant rather than load-bearing. It is
-- the kind of leftover that looks like an intentional grant to whoever reads it
-- next, so it goes with the others.
drop policy if exists "bdocs insert"                 on storage.objects;

-- Deleting your own avatar or listing photo stays a member action: it removes
-- your own content and screening does not apply to a removal.
--
-- STILL A MEMBER-AUTHORED WRITE, and named rather than quietly left:
-- `tpay insert` stays, because `components/payment-proof-upload.tsx` uploads
-- from the BROWSER and would break without it. That path therefore still reaches
-- Storage without passing the server. It is bounded — the bucket enforces 10 MiB
-- and a MIME allowlist, and 0199 removes the UPDATE/DELETE that made the
-- evidence rewritable — but converting it to a server-minted token is the last
-- piece of KCDX-014 and is not done here.

-- ── 3. reviewed evidence stops being editable ─────────────────────────────
drop policy if exists "credential docs delete own" on storage.objects;
drop policy if exists "bdocs delete"               on storage.objects;
drop policy if exists "tpay update"                on storage.objects;
drop policy if exists "tpay delete"                on storage.objects;

-- ── 4. keep it closed ─────────────────────────────────────────────────────
create or replace function public.media_integrity_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no member-authored write path into a screened bucket
    not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and cmd in ('INSERT','UPDATE')
         and policyname in (
           'feed_media_own_insert','avatars insert own','avatars update own',
           'avatars: owner insert','avatars: owner update',
           'listing photos owner insert','listing photos owner update',
           'credential docs insert own'
         )
    )
    -- reviewed evidence cannot be replaced or removed by its submitter
    and not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in ('credential docs delete own','bdocs delete','tpay update','tpay delete')
    )
    -- every bucket that accepts member content declares its own limits, so the
    -- TypeScript check is a nicety rather than the only thing standing there
    and not exists (
      select 1 from storage.buckets
       where id in ('feed-media','avatars','listing-photos','credential-docs',
                    'business-docs','tournament-payments')
         and (file_size_limit is null or allowed_mime_types is null)
    );
$$;

revoke all on function public.media_integrity_intact() from public, anon, authenticated;
grant execute on function public.media_integrity_intact() to service_role;
