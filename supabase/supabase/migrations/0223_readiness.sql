-- 0223_readiness.sql — KCDX-052 (P1): release engineering can ship an
-- application against the wrong database contract.
--
-- Sixteen `*_intact()` boundary checks now exist, added one per remediation
-- batch. Six of them are wired into the boot sentinel. The other ten are
-- functions nobody calls — which is the same as not having them, because a
-- boundary that is only checked when someone remembers to check it is not a
-- boundary, it is a hope.
--
-- Every batch adding its own probe and its own wiring was the wrong shape. It
-- guarantees that the newest check — the one guarding the thing we just learned
-- was broken — is the one most likely to be left unwired.
--
-- `klimr_readiness()` discovers them instead: any function in `public` named
-- `%_intact` taking no arguments and returning boolean is run, and its name and
-- result reported. Adding a check to a future migration wires it in by naming it
-- correctly. There is no list to forget to update.
--
-- Used in three places, which is the point of having one:
--   · the boot sentinel — refuses to start a production deploy against a
--     database whose boundaries are open
--   · CI, after the migration replay
--   · by hand, in the SQL editor, before and after a paste

create or replace function public.klimr_readiness()
returns table (check_name text, passed boolean, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; v_ok boolean; v_err text;
begin
  for r in
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like '%\_intact' escape '\'
       and p.pronargs = 0
       and p.prorettype = 'boolean'::regtype
     order by p.proname
  loop
    begin
      execute format('select public.%I()', r.proname) into v_ok;
      v_err := null;
    exception when others then
      -- A check that ERRORS is not a pass. The most likely cause is the very
      -- thing it guards having been dropped.
      v_ok := false;
      v_err := left(sqlerrm, 200);
    end;
    check_name := r.proname;
    passed := coalesce(v_ok, false);
    detail := v_err;
    return next;
  end loop;
end;
$$;

revoke all on function public.klimr_readiness() from public, anon, authenticated;
grant execute on function public.klimr_readiness() to service_role;

comment on function public.klimr_readiness is
  'KCDX-052: runs every `%_intact()` boundary check by discovery, not by list. A new check is wired in '
  'by naming it correctly — which is the only way the newest check does not end up the unwired one.';

-- ── one call, one answer ─────────────────────────────────────────────────
-- A DROPPED check does not fail — it disappears from the list, and a list with
-- nothing in it has nothing failing in it. That is the same "green because
-- nothing ran" shape this whole remediation keeps finding in other people's
-- tests, and it would have been in the gate meant to catch them.
--
-- So readiness asserts a COUNT as well as a result. The expected number lives in
-- the default argument, and `tests/doc-claims.test.ts` counts the `%_intact`
-- functions actually defined across the migrations and fails the build if the
-- two disagree — so adding a check forces bumping this, and forgetting to bump
-- it is caught before deploy rather than after.
create or replace function public.klimr_ready(p_min_checks integer default 16)
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
