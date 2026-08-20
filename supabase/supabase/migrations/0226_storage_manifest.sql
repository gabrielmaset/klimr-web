-- 0226_storage_manifest.sql — KCDX-053 (P1, part): backup and recovery targets
-- are unproven, and Storage is not backed up at all.
--
-- ── WHAT IS ACTUALLY TRUE ────────────────────────────────────────────────
-- Supabase Pro runs daily backups with 7 days of retention. That covers
-- POSTGRES. It does not cover Storage — so `avatars`, `feed-media`,
-- `credential-docs`, `tournament-payments` and `business-docs` have no backup of
-- any kind. A database restore would return every row and leave every
-- `media_path`, `avatar_path` and `proof_path` pointing at bytes that no longer
-- exist. (RESILIENCE.md claimed Storage was covered; that was corrected under
-- KCDX-058.)
--
-- ── WHAT THIS MIGRATION IS, AND IS NOT ───────────────────────────────────
-- It is NOT a backup. A migration cannot copy object bytes anywhere, and
-- pretending otherwise would be the same category of error as the claim it
-- replaces.
--
-- It is the thing whose absence makes a Storage backup unverifiable. Copying
-- objects out is straightforward; knowing whether the copy was COMPLETE, and
-- whether a restore brought everything back, is not — and without that, a
-- successful-looking restore is indistinguishable from a partial one until
-- somebody opens a profile and finds a broken image.
--
-- So: take a manifest before, restore, compare. `storage_manifest_verify()`
-- names exactly which objects are missing, which is what turns a drill into
-- evidence rather than an impression.

create table if not exists public.storage_manifests (
  id          uuid primary key default gen_random_uuid(),
  taken_at    timestamptz not null default now(),
  note        text,
  object_count bigint not null,
  total_bytes  bigint not null
);

create table if not exists public.storage_manifest_entries (
  manifest_id uuid not null references public.storage_manifests(id) on delete cascade,
  bucket_id   text not null,
  name        text not null,
  size_bytes  bigint,
  etag        text,
  created_at  timestamptz,
  primary key (manifest_id, bucket_id, name)
);

alter table public.storage_manifests enable row level security;
alter table public.storage_manifest_entries enable row level security;
grant all on public.storage_manifests, public.storage_manifest_entries to service_role;
-- No member-facing policy: this is an inventory of every file in the system.

/** Snapshot what Storage currently holds. Run BEFORE a backup and again after a
 *  restore; the two are then comparable. */
create or replace function public.storage_manifest_take(p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.storage_manifests (note, object_count, total_bytes)
  values (p_note, 0, 0) returning id into v_id;

  insert into public.storage_manifest_entries (manifest_id, bucket_id, name, size_bytes, etag, created_at)
  select v_id, o.bucket_id, o.name,
         (o.metadata->>'size')::bigint,
         -- The eTag is the storage layer's own content fingerprint. It is what
         -- makes "the file came back" distinguishable from "a file with that
         -- name came back", which is the failure a restore actually produces.
         o.metadata->>'eTag',
         o.created_at
    from storage.objects o;

  update public.storage_manifests m
     set object_count = (select count(*) from public.storage_manifest_entries e where e.manifest_id = v_id),
         total_bytes  = (select coalesce(sum(size_bytes), 0) from public.storage_manifest_entries e where e.manifest_id = v_id)
   where m.id = v_id;

  return v_id;
end;
$$;

/** Compare a manifest against what Storage holds NOW. Empty result = everything
 *  in the manifest is present with matching content. */
create or replace function public.storage_manifest_verify(p_manifest uuid)
returns table (bucket_id text, name text, problem text)
language sql
stable
security definer
set search_path = public
as $$
  select e.bucket_id, e.name,
         case
           when o.name is null then 'missing'
           when e.etag is not null and o.metadata->>'eTag' is distinct from e.etag then 'content_differs'
           else 'size_differs'
         end
    from public.storage_manifest_entries e
    left join storage.objects o
      on o.bucket_id = e.bucket_id and o.name = e.name
   where e.manifest_id = p_manifest
     and (
       o.name is null
       or (e.etag is not null and o.metadata->>'eTag' is distinct from e.etag)
       or (e.etag is null and (o.metadata->>'size')::bigint is distinct from e.size_bytes)
     )
   order by e.bucket_id, e.name;
$$;

/** What a drill report needs in one row. */
create or replace function public.storage_manifest_summary(p_manifest uuid)
returns table (taken_at timestamptz, objects bigint, bytes bigint, missing bigint, differing bigint, verified boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.taken_at, m.object_count, m.total_bytes,
         (select count(*) from public.storage_manifest_verify(p_manifest) where problem = 'missing'),
         (select count(*) from public.storage_manifest_verify(p_manifest) where problem <> 'missing'),
         not exists (select 1 from public.storage_manifest_verify(p_manifest))
    from public.storage_manifests m
   where m.id = p_manifest;
$$;

revoke all on function public.storage_manifest_take(text) from public, anon, authenticated;
revoke all on function public.storage_manifest_verify(uuid) from public, anon, authenticated;
revoke all on function public.storage_manifest_summary(uuid) from public, anon, authenticated;
grant execute on function public.storage_manifest_take(text) to service_role;
grant execute on function public.storage_manifest_verify(uuid) to service_role;
grant execute on function public.storage_manifest_summary(uuid) to service_role;

comment on function public.storage_manifest_take is
  'KCDX-053: inventory of every Storage object with its content fingerprint. This is NOT a backup — a '
  'migration cannot copy bytes. It is what makes a backup verifiable, because a successful-looking '
  'restore is otherwise indistinguishable from a partial one until someone finds a broken image.';
