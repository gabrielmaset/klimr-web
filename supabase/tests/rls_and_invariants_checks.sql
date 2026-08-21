-- rls_and_invariants_checks.sql — database-level safety assertions (K1-07 · audit SEC-009/TEST-001).
--
-- ⚠ HISTORY (KCDX-018, repaired 2026-08-18). This file once set
-- `request.jwt.claims` without ever assuming a role, so every probe ran as the
-- invoker (in the editor: the owner) and the "cross-user IDOR probe" tested
-- nothing — it failed by detecting its own unfiltered superuser write.
-- REPAIRED in the diagnostic packet: pg_temp.impersonate() now also assumes
-- the `authenticated` role, pg_temp.elevate() returns via RESET ROLE, and the
-- probes assert current doctrine (private profile columns: denial IS the
-- pass). The warning stays as history because the failure class is easy to
-- reintroduce.
--
-- Block 1 (the schema-wide RLS assertion) is a catalog query and remains valid —
-- it is checking metadata, not behaviour, so the caller's identity is irrelevant.
--
-- For real negative authorization, run `rls_negative_suite.sql`, which switches
-- to the actual `anon` / `authenticated` / `service_role` roles before probing.
-- It is wired into supabase/harness/replay.sh and runs on every replay in CI.
--
-- Run in the Supabase SQL editor any time (safe on production: the
-- write-containing transaction ends in ROLLBACK — nothing persists; the
-- trailing grant check is read-only). Complements social_graph_checks.sql.
-- Four blocks:
--   (1) schema-wide RLS assertion — fails if ANY table PostgREST can reach
--       (public schema, accessible to anon/authenticated) lacks RLS enabled;
--   (2) queue invariants — the wedge's integrity (no double-forming team);
--   (3) a cross-user IDOR probe — one member cannot read or write another's
--       private profile columns (denied at the grant/policy layer);
--   (4) a grant check — service_role can execute every server-only function.
-- Each block RAISES on violation; a clean run prints the PASSED banner.
--
-- NOTE: rank_snapshots (0174) is the canonical "RLS on, zero policies, grants
-- revoked" case — this suite treats revoked-grants OR rls-enabled as safe, so
-- that lockdown style passes while a genuinely exposed table fails.

begin;

-- ── (1) Schema-wide RLS assertion ──────────────────────────────────────────
do $body$
declare
  bad text;
  n int;
begin
  -- A table is "reachable" if anon or authenticated holds any table privilege
  -- on it. Such a table MUST have relrowsecurity = true. Tables with all grants
  -- revoked (the 0174 pattern) are not reachable and are correctly exempt.
  select string_agg(t.relname, ', '), count(*)
    into bad, n
  from pg_class t
  join pg_namespace ns on ns.oid = t.relnamespace
  where ns.nspname = 'public'
    and t.relkind = 'r'
    and not t.relrowsecurity
    and exists (
      select 1
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = t.relname
        and g.grantee in ('anon', 'authenticated')
    );
  if n > 0 then
    raise exception 'RLS CHECK failed: % reachable table(s) without RLS enabled: %', n, bad;
  end if;
  raise notice 'ok   RLS check: no exposed tables without RLS.';
end;
$body$;

-- ── (2) Queue invariants ───────────────────────────────────────────────────
-- A court may hold at most one team in the "forming" state at a time (the next
-- team assembling to play). This guards the invariant structurally.
do $body$
declare
  dup int;
begin
  select coalesce(max(cnt), 0) into dup
  from (
    select court_id, count(*) as cnt
    from public.queue_teams
    where status = 'forming'
    group by court_id
  ) s;
  if dup > 1 then
    raise exception 'QUEUE INVARIANT failed: a court has % teams in forming state (max 1)', dup;
  end if;
  raise notice 'ok   Queue invariant: at most one forming team per court.';
end;
$body$;

-- ── (3) Cross-user IDOR probe ──────────────────────────────────────────────
insert into auth.users (id, email)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'idor-a@klimr.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'idor-b@klimr.test');

create or replace function pg_temp.impersonate(u uuid) returns void language sql as $$
  -- The claims alone do NOT engage RLS: without assuming the authenticated
  -- role, every statement runs as the superuser and the policies are never
  -- consulted. That was this suite's original defect — its IDOR probe
  -- "failed" by detecting its own unfiltered superuser write (the failing
  -- run doubles as proof the oracle fires on a real bypass).
  select set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('role', 'authenticated', true);
$$;

create or replace function pg_temp.elevate() returns void language plpgsql as $$
begin
  -- back to the session role for fixture work. RESET ROLE is unconditionally
  -- allowed; set_config('role','none') proved to be a silent no-op here.
  execute 'reset role';
end $$;

do $body$
declare
  a uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  seen int;
begin
  -- Fixture write runs ELEVATED: profile columns are not directly writable by
  -- the authenticated role in the current era (edits travel through server
  -- actions); RLS+grants together are the boundary this probe tests.
  perform pg_temp.elevate();
  update public.profiles set home_zip = '90066' where id = b;

  -- A, impersonated, must not see B's PRIVATE columns. In the current era
  -- home_zip is column-guarded (0282): the read itself is DENIED for
  -- authenticated, which is the strongest form of the boundary — the probe
  -- treats denial as the pass, zero-visible as acceptable, and a visible
  -- value as the failure.
  perform pg_temp.impersonate(a);
  begin
    select count(*) into seen from public.profiles where id = b and home_zip = '90066';
  exception when insufficient_privilege then
    seen := 0; -- the column boundary held at the grant layer
  end;
  if seen > 0 then
    raise exception 'IDOR CHECK failed: user A can read user B''s private column';
  end if;
  -- And A cannot UPDATE B either:
  begin
    update public.profiles set home_zip = '00000' where id = b;
  exception when insufficient_privilege then
    null; -- blocked at the grant/policy layer: correct
  end;
  -- Whatever happened above, B's row must be untouched — verified elevated.
  perform pg_temp.elevate();
  if (select home_zip from public.profiles where id = b) = '00000' then
    raise exception 'IDOR CHECK failed: user A modified user B''s profile row';
  end if;
  raise notice 'ok   IDOR probe: cross-user profile write blocked.';
end;
$body$;

do $$ begin raise notice 'ok   ALL RLS & INVARIANT CHECKS PASSED'; end $$;

rollback;

-- ── (4) service_role can EXECUTE every server-only function ────────────────
-- Added after a production incident (Aug 2026): migrations 0176–0182 each ended
-- with `revoke all on function ... from anon, authenticated, public`, which also
-- strips the IMPLICIT execute grant service_role relies on. Queue joins failed
-- with "permission denied for function place_on_team". The original harness ran
-- as postgres (superuser), which bypasses permission checks, so it never caught
-- it. This block asserts the app's own role can actually call what it needs.
do $body$
declare
  fn      text;
  missing text[] := '{}';
  fns     text[] := array[
    'place_on_team', 'queue_version', 'enqueue_job', 'claim_jobs', 'complete_job',
    'fail_job', 'replay_job', 'merge_format_config', 'courtside_heartbeat',
    'court_data_quality', 'ranking_data_quality', 'courtside_fleet_status',
    'courtside_device_tiers'
  ];
begin
  foreach fn in array fns loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
        and has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) then
      missing := missing || fn;
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'GRANT CHECK failed: service_role cannot EXECUTE: %', array_to_string(missing, ', ');
  end if;
  raise notice 'ok   Grant check: service_role can execute all % server-only functions.', array_length(fns, 1);
end;
$body$;
