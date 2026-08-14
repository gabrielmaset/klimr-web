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

drop policy if exists "feed read published" on public.feed_items;
create policy "feed read published" on public.feed_items
  for select using (
    auth.role() = 'authenticated'
    and published_at <= now()
    and public.feed_actor_visible(actor_id)
  );

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
