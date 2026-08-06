-- 0178_jobs.sql — durable background jobs (audit COURT-006/DEP-005 · K2-03).
--
-- WHY. Background work today is fire-and-forget. Courts verification runs
-- inside `after(() => verifyVenues(...))`: if the serverless instance is
-- recycled mid-flight, the venue is simply never verified and nothing records
-- that it was lost. The waitlist sweep has the same shape — a cron tick that
-- fails takes its work with it. Neither leaves a trace an operator can find or
-- replay, which is exactly the class of silent failure a pilot cannot afford.
--
-- WHAT. One small jobs table with the four properties that make background
-- work survivable:
--   · LEASE      — a worker claims rows with FOR UPDATE SKIP LOCKED and holds
--                  them for a bounded time, so two instances never run the same
--                  job, and a worker that dies mid-job has its lease expire and
--                  the job returned to the queue automatically;
--   · BACKOFF    — failures reschedule with exponential delay rather than
--                  hot-looping against a broken dependency;
--   · DEAD-LETTER— after max_attempts the job parks in 'dead' instead of
--                  retrying forever, where an operator can see it;
--   · REPLAY     — a dead or done job can be re-queued from the admin console.
--
-- Plus `dedupe_key` so enqueueing the same logical work twice is a no-op, and
-- `correlation_id` so a job can be traced back to the request that created it.
--
-- NOT RISKY: one new table, its indexes, and four functions. Nothing existing
-- is read or rewritten; adopting code changes behavior only where it opts in.
-- Backup not required.

create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  payload        jsonb not null default '{}'::jsonb,
  dedupe_key     text unique,
  status         text not null default 'queued'
                 check (status in ('queued', 'running', 'done', 'dead')),
  attempts       int not null default 0,
  max_attempts   int not null default 5,
  run_after      timestamptz not null default now(),
  leased_until   timestamptz,
  lease_owner    text,
  last_error     text,
  correlation_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.jobs enable row level security;
-- Server-only: every reader and writer goes through the definer functions
-- below or the service role. No client grants, deliberately.
revoke all on table public.jobs from anon, authenticated, public;

-- The claim path's index: runnable work, oldest first.
create index if not exists jobs_runnable_idx
  on public.jobs (kind, run_after)
  where status in ('queued', 'running');

create index if not exists jobs_status_created_idx
  on public.jobs (status, created_at desc);

-- ── Enqueue ────────────────────────────────────────────────────────────────
-- Returns the job id. With a dedupe_key, a repeat call returns the EXISTING
-- job instead of creating a second one (safe to call from a retried request).
create or replace function public.enqueue_job(
  p_kind           text,
  p_payload        jsonb,
  p_dedupe_key     text default null,
  p_run_after      timestamptz default now(),
  p_max_attempts   int default 5,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_dedupe_key is not null then
    select id into v_id from public.jobs where dedupe_key = p_dedupe_key;
    if found then
      return v_id;
    end if;
  end if;

  insert into public.jobs (kind, payload, dedupe_key, run_after, max_attempts, correlation_id)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, coalesce(p_run_after, now()),
          coalesce(p_max_attempts, 5), p_correlation_id)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  -- Lost a race on the dedupe key: return the winner's id.
  if v_id is null and p_dedupe_key is not null then
    select id into v_id from public.jobs where dedupe_key = p_dedupe_key;
  end if;

  return v_id;
end; $$;

-- ── Claim ──────────────────────────────────────────────────────────────────
-- Atomically leases up to p_limit runnable jobs to p_owner. SKIP LOCKED means
-- concurrent workers step past each other's rows instead of blocking, so N
-- workers claim N disjoint sets. Jobs whose lease has EXPIRED (a worker died)
-- are reclaimed by the same query — that is the durability guarantee.
create or replace function public.claim_jobs(
  p_kind          text,
  p_limit         int default 10,
  p_owner         text default 'worker',
  p_lease_seconds int default 300
) returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.jobs j
     set status       = 'running',
         attempts     = j.attempts + 1,
         leased_until = now() + make_interval(secs => greatest(p_lease_seconds, 10)),
         lease_owner  = p_owner,
         updated_at   = now()
   where j.id in (
     select c.id
       from public.jobs c
      where (p_kind is null or c.kind = p_kind)
        and c.run_after <= now()
        and (
              c.status = 'queued'
              or (c.status = 'running' and c.leased_until is not null and c.leased_until < now())
            )
      order by c.run_after
      limit greatest(p_limit, 1)
      for update skip locked
   )
  returning j.*;
end; $$;

-- ── Complete / fail ────────────────────────────────────────────────────────
create or replace function public.complete_job(p_id uuid) returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set status = 'done', leased_until = null, lease_owner = null,
         last_error = null, updated_at = now()
   where id = p_id;
$$;

-- Reschedules with exponential backoff (10s, 20s, 40s, … capped at 1h) until
-- max_attempts is spent, then parks the job in 'dead' for operator review.
create or replace function public.fail_job(p_id uuid, p_error text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
  v_max      int;
  v_delay    int;
  v_status   text;
begin
  select attempts, max_attempts into v_attempts, v_max
    from public.jobs where id = p_id;
  if not found then
    return null;
  end if;

  if v_attempts >= v_max then
    v_status := 'dead';
    update public.jobs
       set status = 'dead', leased_until = null, lease_owner = null,
           last_error = left(coalesce(p_error, ''), 2000), updated_at = now()
     where id = p_id;
  else
    v_status := 'queued';
    v_delay := least(10 * power(2, greatest(v_attempts - 1, 0))::int, 3600);
    update public.jobs
       set status = 'queued', leased_until = null, lease_owner = null,
           run_after = now() + make_interval(secs => v_delay),
           last_error = left(coalesce(p_error, ''), 2000), updated_at = now()
     where id = p_id;
  end if;

  return v_status;
end; $$;

-- ── Replay (admin console) ─────────────────────────────────────────────────
-- Puts a dead or completed job back on the queue with a fresh attempt budget.
create or replace function public.replay_job(p_id uuid) returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set status = 'queued', attempts = 0, run_after = now(),
         leased_until = null, lease_owner = null, updated_at = now()
   where id = p_id and status in ('dead', 'done');
$$;

revoke all on function public.enqueue_job(text, jsonb, text, timestamptz, int, text) from anon, authenticated, public;
revoke all on function public.claim_jobs(text, int, text, int) from anon, authenticated, public;
revoke all on function public.complete_job(uuid) from anon, authenticated, public;
revoke all on function public.fail_job(uuid, text) from anon, authenticated, public;
revoke all on function public.replay_job(uuid) from anon, authenticated, public;
