-- 0244_storage_deletion_worker.sql — the claim/mark half of KRA-011, so the
-- deletion outbox is drained rather than merely recorded.
--
-- 0243 made the INTENT durable. A migration cannot call the Storage API, so
-- something outside the database has to perform it and write back the result.
-- This adds the two commands that let a worker do that safely, and nothing else.
--
-- Where the worker runs, and why not a new cron entry: the every-minute
-- waitlist-sweep tick already exists, already authenticates, and already drains
-- the durable jobs table for exactly this reason — "durable work has a guaranteed
-- heartbeat without a second cron entry". KCDX-039 found that BOTH scheduled
-- routes had never executed for their entire lives because nobody added them to
-- the middleware's public paths, and the 2026-08-10 incident showed a second way
-- the same leg fails. A new schedule is a new thing to be silently broken; an
-- existing tick that is known to fire is not.

-- ── claim ────────────────────────────────────────────────────────────────
-- `for update skip locked` so two overlapping ticks cannot both claim the same
-- object, and `attempts` increments on claim rather than on success — an object
-- that kills the worker every time must not be retried forever in silence.
create or replace function public.claim_storage_deletions(p_limit int default 100)
returns table (id uuid, bucket_id text, object_path text, attempts int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select d.id
      from public.storage_deletions d
     where d.deleted_at is null
       and d.attempts < 8
     order by d.requested_at
     limit greatest(coalesce(p_limit, 100), 1)
     for update skip locked
  )
  update public.storage_deletions d
     set attempts = d.attempts + 1
    from picked
   where d.id = picked.id
  returning d.id, d.bucket_id, d.object_path, d.attempts;
end $$;

revoke all on function public.claim_storage_deletions(int) from public, anon, authenticated;
grant execute on function public.claim_storage_deletions(int) to service_role;

-- ── mark ─────────────────────────────────────────────────────────────────
-- Completion is recorded ONLY when the API confirmed. The whole finding was a
-- system that treated a vanished catalog row as proof of deletion, so "we asked"
-- must never be written as "it happened".
create or replace function public.mark_storage_deletion(
  p_id    uuid,
  p_ok    boolean,
  p_error text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.storage_deletions
     set deleted_at = case when p_ok then now() else null end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'unknown'), 500) end
   where id = p_id;
$$;

revoke all on function public.mark_storage_deletion(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.mark_storage_deletion(uuid, boolean, text) to service_role;

-- ── the canary learns about exhausted rows ───────────────────────────────
-- An object that has failed eight times is no longer claimed, so the original
-- "older than 6 hours and undeleted" test would keep counting it forever and
-- become noise. Separating "waiting" from "given up" keeps both meaningful — a
-- canary nobody can act on gets muted, and muting it takes the real alarm too.
create or replace function public.storage_deletions_stuck()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.storage_deletions
   where deleted_at is null
     and attempts < 8
     and requested_at < now() - interval '6 hours';
$$;

create or replace function public.storage_deletions_abandoned()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.storage_deletions
   where deleted_at is null and attempts >= 8;
$$;

revoke all on function public.storage_deletions_stuck() from public, anon, authenticated;
grant execute on function public.storage_deletions_stuck() to service_role;
revoke all on function public.storage_deletions_abandoned() from public, anon, authenticated;
grant execute on function public.storage_deletions_abandoned() to service_role;

comment on function public.storage_deletions_abandoned is
  'KRA-011: objects the worker gave up on. These are the ones a human has to look at — bytes we '
  'promised to delete and could not. Deliberately separate from _stuck() so neither number becomes '
  'noise the other hides in.';
