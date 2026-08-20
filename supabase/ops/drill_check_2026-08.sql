-- drill_check_2026-08.sql — the restore drill's single-paste verdict (WP-R · KFU-020).
--
-- Paste into the SCRATCH project's SQL editor after the restore (RESILIENCE §3
-- step 4). Read-only: no writes, no transaction, safe anywhere — including
-- production, where it simply reports the live numbers.
--
-- The star witness is klimr_ready(): all 43 production sentinels executed
-- against the restored copy. A backup that restores into a database where the
-- readiness gate goes green has demonstrably brought back the schema, the
-- commands, the triggers, the grants and the invariants — not just the rows.
--
-- One statement, one result table (the editor shows only the last statement's
-- output, so everything is a single UNION). Expected values for a healthy
-- drill are in RESILIENCE §3; record the whole table in the §6 drill log.

select * from (

  select 1 as ord, 'migrations: journal head' as check,
         coalesce((select max(id) from public.migration_journal), '(journal missing!)') as value,
         coalesce((select max(id) from public.migration_journal), '') >= '0295' as ok

  union all
  select 2, 'migrations: journaled count',
         (select count(*)::text from public.migration_journal),
         (select count(*) from public.migration_journal) > 0

  union all
  select 3, 'readiness: klimr_ready()',
         case when public.klimr_ready() then 'true' else 'FALSE' end,
         public.klimr_ready()

  union all
  select 4, 'readiness: sentinels run',
         (select count(*)::text from public.klimr_readiness()),
         (select count(*) from public.klimr_readiness()) >= 43

  union all
  select 5, 'readiness: failing sentinels',
         coalesce((select string_agg(check_name, ', ' order by check_name)
                     from public.klimr_readiness() where not passed), '(none)'),
         not exists (select 1 from public.klimr_readiness() where not passed)

  union all
  select 6, 'data: auth.users',
         (select count(*)::text from auth.users),
         (select count(*) from auth.users) > 0

  union all
  select 7, 'data: profiles',
         (select count(*)::text from public.profiles),
         (select count(*) from public.profiles) = (select count(*) from auth.users)

  union all
  select 8, 'data: newest court session',
         coalesce((select max(created_at)::text from public.court_sessions), '(none yet)'),
         true  -- informational: the gap to "now" is part of your observed RPO

  union all
  select 9, 'storage: latest manifest',
         coalesce((select 'id=' || left(id::text, 8) || '…  objects=' || object_count ||
                          '  taken=' || to_char(taken_at, 'YYYY-MM-DD HH24:MI')
                     from public.storage_manifests
                    order by taken_at desc limit 1), '(no manifest rows!)'),
         exists (select 1 from public.storage_manifests)

  union all
  select 10, 'rls: exposed tables without RLS',
         (select count(*)::text
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
             and exists (select 1 from information_schema.role_table_grants g
                          where g.table_schema = 'public' and g.table_name = c.relname
                            and g.grantee in ('anon', 'authenticated'))),
         (select count(*)
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
             and exists (select 1 from information_schema.role_table_grants g
                          where g.table_schema = 'public' and g.table_name = c.relname
                            and g.grantee in ('anon', 'authenticated'))) = 0

  union all
  select 11, 'cron: pg_cron jobs present',
         case when to_regclass('cron.job') is null
              then '(cron schema absent — normal in a scratch restore; prod re-schedules via 0172/0173)'
              else (select count(*)::text || ' job(s)' from cron.job) end,
         true  -- informational either way: scratch projects do not run cron

) checks
order by ord;
