-- 0179_tournament_config_merge.sql — atomic format_config merges (audit TOUR-003 · K2-04).
--
-- WHY. `updateTournament()` merges `format_config` by reading the current JSON,
-- spreading a patch over it in app memory, and writing the result back. Two
-- organizers saving different settings tabs at the same moment both read the
-- same base, and the second write silently discards the first. Reproduced in a
-- scratch Postgres 16 cluster: A published the schedule while B saved the
-- rules text — the final row contained only B's change, with no error shown to
-- either of them. Tournament settings are exactly the kind of thing two staff
-- edit simultaneously the night before an event.
--
-- FIX. Do the read and the merge inside one statement, under a row lock, in
-- the database. `jsonb || jsonb` is a shallow merge — the same semantics as
-- the object spread it replaces, so behaviour is unchanged when there is no
-- contention.
--
-- Optional OPTIMISTIC CONCURRENCY: pass the `updated_at` the editor's form was
-- rendered from and the merge raises `stale_write` if the row moved underneath
-- them. That turns a silent overwrite into a visible "someone else just
-- changed this — reload" message. Callers that don't care (server-side
-- housekeeping) pass null and get last-write-wins with the lock still held,
-- which is strictly better than today.
--
-- NOT RISKY: one function; no schema change, no data rewritten. If the app
-- never calls it, nothing changes. Backup not required.

create or replace function public.merge_format_config(
  p_id                  uuid,
  p_patch               jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current    jsonb;
  v_updated_at timestamptz;
  v_result     jsonb;
begin
  -- Lock the row for the rest of the transaction: any concurrent merge queues
  -- behind this one and will read the POST-merge value, not the stale base.
  select format_config, updated_at
    into v_current, v_updated_at
    from public.tournaments
   where id = p_id
     for update;

  if not found then
    raise exception 'tournament_not_found' using errcode = 'P0002';
  end if;

  -- Optimistic concurrency: only when the caller supplies an expectation.
  -- Compared at MILLISECOND precision: Postgres timestamptz carries
  -- microseconds but a JS ISO string carries only milliseconds, so an exact
  -- comparison would reject every legitimate round-trip. Millisecond
  -- truncation is the tightest comparison that survives that trip — second
  -- truncation was tried first and proved too coarse to catch two edits
  -- landing inside the same second.
  if p_expected_updated_at is not null
     and date_trunc('milliseconds', v_updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'stale_write' using errcode = '40001';
  end if;

  v_result := coalesce(v_current, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);

  update public.tournaments
     set format_config = v_result,
         updated_at    = now()
   where id = p_id;

  return v_result;
end; $$;

revoke all on function public.merge_format_config(uuid, jsonb, timestamptz) from anon, authenticated, public;
