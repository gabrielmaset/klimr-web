-- 0205_config_patch_only.sql — KCDX-047 (P1): tournament JSON lost-update
-- remediation is incomplete.
--
-- 0179 built the right primitive. `merge_format_config` locks the row, merges a
-- patch, and optionally checks an expected `updated_at`. Then it was wired into
-- exactly TWO call sites, and roughly a dozen read-spread-write siblings were
-- left in place:
--
--     const fc = { ...(to.format_config ?? {}), sponsors: clean };
--     await supabase.from("tournaments").update({ format_config: fc })…
--
-- Every one of those reads the whole document, edits one key in JavaScript, and
-- writes the whole document back. Two staff members editing a tournament at the
-- same time — one adding sponsors, one publishing the schedule — and whoever
-- writes second silently erases the other's change. Not a conflict, not an
-- error: the key simply reverts, and the person who made it has no reason to
-- look again.
--
-- A patch API that most callers bypass is not a fix; it is a fix plus a
-- documented way around it. This migration removes the reason to bypass.
--
-- WHY AUTHORIZATION MOVES INTO THE FUNCTION. `merge_format_config` was granted to
-- `service_role` alone, so a server action holding the caller's cookie session
-- could not use it — which is a large part of why the sibling paths survived: the
-- easy thing was the wrong thing. The staff check lives here now, so the function
-- is safe to grant to `authenticated`, the easy thing becomes the right thing,
-- and the authorization stops depending on every caller remembering it.

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
  -- The check the TypeScript callers were each doing by hand, done once, here,
  -- where it cannot be forgotten. `is_privileged_writer()` covers cron and the
  -- service role; `is_tournament_staff()` is the same predicate the policies use.
  if not (public.is_privileged_writer() or public.is_tournament_staff(p_id)) then
    raise exception 'not_tournament_staff' using errcode = '42501';
  end if;

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

  -- Optimistic concurrency, only when the caller supplies an expectation.
  -- Compared at MILLISECOND precision: Postgres timestamptz carries microseconds
  -- but a JS ISO string carries only milliseconds, so an exact comparison would
  -- reject every legitimate round-trip.
  if p_expected_updated_at is not null
     and date_trunc('milliseconds', v_updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'config_conflict' using errcode = '40001';
  end if;

  -- `||` is a shallow merge, which is what these patches want: each key in the
  -- patch replaces that key wholesale, and every key NOT in the patch survives
  -- untouched. That is precisely what the read-spread-write pattern failed to do.
  v_result := coalesce(v_current, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);

  update public.tournaments
     set format_config = v_result,
         updated_at    = now()
   where id = p_id;

  return v_result;
end;
$$;

revoke all on function public.merge_format_config(uuid, jsonb, timestamptz) from anon, public;
grant execute on function public.merge_format_config(uuid, jsonb, timestamptz) to authenticated, service_role;

comment on function public.merge_format_config is
  'KCDX-047: the ONLY supported way to change tournaments.format_config. Locks the row, shallow-merges '
  'the patch, and authorizes staff internally. A read-spread-write from application code loses concurrent edits.';
