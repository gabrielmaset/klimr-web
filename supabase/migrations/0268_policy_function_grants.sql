-- 0268_policy_function_grants.sql — every function an RLS policy calls must be
-- executable by the roles that hit that policy; enumerated, not guessed.
--
-- THE CLASS, THIRD SIGHTING. A policy expression runs with the QUERYING role's
-- rights (0237 said so in its own header). 0239's sweep removed the accidental
-- PUBLIC-default EXECUTE from every function and re-granted `authenticated`
-- only where the ACL showed a deliberate grant — correct doctrine, but nobody
-- then enumerated the functions whose only callers are POLICIES. Three
-- consequences, each observed:
--
--   · Executed-local at head: `select count(*) from feed_items` as
--     `authenticated` fails with "permission denied for function is_muted_by".
--     The feed page still reads feed_items for the admin-updates lane, so the
--     lane dies silently for every member.
--   · Executed-local at head: `select count(*) from tournaments` as `anon`
--     fails with "permission denied for function tournament_is_visible" — the
--     public tournament pages are policy-gated on a function the public role
--     may not run.
--   · Reported from production (2026-08-12 screenshot): "permission denied for
--     function is_match_participant" on the match surface. At the replayed
--     head that function IS granted, so production's ACL has drifted from the
--     migration record — which is exactly why this migration RECONCILES from
--     the live catalog instead of hard-coding a list. Whatever production is
--     actually missing, the loop below finds it there and the RAISE NOTICE
--     lines in the paste output become the production forensic.
--
-- THE 0237 EXCEPTION, PRESERVED. Six raw pair-predicates were deliberately
-- revoked from `authenticated` because an arbitrary-pair helper is a
-- relationship oracle. Those must NEVER be re-granted by a reconciler. The one
-- policy still calling one of them (`feed_items` → is_muted_by) is rewritten
-- first to a caller-bound SECURITY DEFINER wrapper — the same pattern 0237
-- used for can_i_act_on — and the reconciler then treats any remaining policy
-- reference to a deny-listed predicate as an error that stops the migration.

-- ── 1. Caller-bound wrapper for the feed_items visibility test ───────────────
-- One argument, always evaluated against auth.uid(): not an oracle. DEFINER so
-- it may reach the revoked raw predicates. NULL actor (house/admin items) is
-- visible, which is what the old expression computed too: both raw predicates
-- return false for a null counterpart.

create or replace function public.feed_actor_visible(
  p_actor uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_actor is null
      or ( not public.is_blocked_pair(auth.uid(), p_actor)
       and not public.is_muted_by(auth.uid(), p_actor) );
$$;

revoke all on function public.feed_actor_visible(uuid) from public, anon;
grant execute on function public.feed_actor_visible(uuid) to authenticated, service_role;

comment on function public.feed_actor_visible is
  'Caller-bound visibility test for feed_items: is the item''s actor neither blocked against nor '
  'muted by the CURRENT viewer. SECURITY DEFINER so RLS may use it while the raw pair predicates '
  'stay revoked from members (0237 doctrine: arbitrary-pair helpers are relationship oracles).';

drop policy if exists "feed read published" on public.feed_items;
create policy "feed read published" on public.feed_items
  for select using (
    auth.role() = 'authenticated'
    and published_at <= now()
    and public.feed_actor_visible(actor_id)
  );

-- ── 2. Deny-list guard: no policy may reference a raw pair predicate ────────
-- If a future policy reaches for one of these directly, the migration (and the
-- replay gate that runs this same query) must stop, not silently grant.

do $$
declare
  v_bad text;
begin
  v_bad := (
    select string_agg(distinct c.relname || '.' || pol.polname || ' -> ' || pr.proname, ', ')
    from pg_depend d
    join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
    join pg_class  c   on c.oid = pol.polrelid
    join pg_proc   pr  on pr.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = pr.pronamespace and n.nspname = 'public'
   where pr.proname in ('may_act_on','may_see_connections','may_see_schedule',
                        'is_muted_by','is_restricted_by','comment_visible_to') );
  if v_bad is not null then
    raise exception 'policy references a deny-listed pair predicate: % — rewrite the policy to a caller-bound wrapper (see feed_actor_visible)', v_bad;
  end if;
end $$;

-- ── 3. The reconciler ────────────────────────────────────────────────────────
-- Read the live catalog: every function referenced by any RLS policy gets
-- EXECUTE for `authenticated` (service_role bypasses RLS and never evaluates a
-- policy), and additionally for `anon` where the policy protects a table in
-- `public` that anon holds a privilege on — those are the logged-out surfaces
-- (tournaments, draws, divisions, sports, …). Each grant is NOTICEd so the
-- SQL-editor output is the record of what THIS database was missing.

do $$
declare
  r        record;
  v_sig    text;
  v_grants int := 0;
begin
  for r in
    select pr.oid,
           pr.proname,
           pg_get_function_identity_arguments(pr.oid) as args,
           bool_or( tn.nspname = 'public'
                    and has_table_privilege('anon', pol.polrelid, 'select') ) as anon_hits
      from pg_depend d
      join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
      join pg_class  tc  on tc.oid = pol.polrelid
      join pg_namespace tn on tn.oid = tc.relnamespace
      join pg_proc   pr  on pr.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
      join pg_namespace n on n.oid = pr.pronamespace and n.nspname = 'public'
     group by pr.oid, pr.proname
  loop
    v_sig := format('public.%I(%s)', r.proname, r.args);
    if not has_function_privilege('authenticated', r.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', v_sig);
      raise notice 'policy-fn grant: authenticated <- %', v_sig;
      v_grants := v_grants + 1;
    end if;
    if r.anon_hits and not has_function_privilege('anon', r.oid, 'execute') then
      execute format('grant execute on function %s to anon', v_sig);
      raise notice 'policy-fn grant: anon <- %', v_sig;
      v_grants := v_grants + 1;
    end if;
  end loop;
  raise notice 'policy-fn reconciler: % grant(s) applied (zero means this database already agreed with the record)', v_grants;
end $$;

select public.journal_migration('0268', '0268_policy_function_grants.sql', null,
  'Policy-referenced functions granted to the roles that evaluate them. feed_items rewritten to caller-bound feed_actor_visible. Raw pair predicates stay member-revoked.');
