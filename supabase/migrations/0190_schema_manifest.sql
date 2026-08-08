-- 0190_schema_manifest.sql — make the boot sentinel able to see functions
-- (KCDX-004, Batch B).
--
-- WHY THIS EXISTS. `lib/schema-check.ts` probes sentinel COLUMNS. That catches
-- a missing `alter table … add column`, and nothing else. Migrations 0176–0189
-- added almost no columns — they added tables, functions, and GRANTs. The one
-- incident this repo has actually had of this class was 0183: a batch revoked
-- `service_role` EXECUTE on the app's own functions and the app returned
-- "permission denied for function" until a repair migration went in. A column
-- probe cannot see that, and neither can a build.
--
-- So the manifest lives in the database, where the catalog is, and the app asks
-- it one question at boot: what is missing? Two checks per function — does it
-- exist, and can `service_role` execute it. Tables are checked for existence.
--
-- Read-only, `stable`, no side effects. SECURITY DEFINER because `has_function_
-- privilege` and `to_regprocedure` need to see the catalog regardless of caller,
-- and EXECUTE is granted to `service_role` only.
--
-- KEEPING IT HONEST: when a migration adds an app-required table or function,
-- add it here in the same batch. The list below is the contract between the
-- deployed code and the database; if it drifts, the sentinel stops meaning
-- anything. `docs/MIGRATIONS_LEDGER.md` records the same fact for humans.

create or replace function public.schema_manifest_missing()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  required text[] := array[
    -- 0176 atomic queue placement
    'table:public.queue_command_log',
    'function:public.place_on_team(uuid,uuid,text,text)',
    -- 0177 queue state version
    'table:public.queue_session_version',
    'function:public.queue_version(uuid)',
    -- 0178 durable jobs
    'table:public.jobs',
    'function:public.enqueue_job(text,jsonb,text,timestamptz,integer,text)',
    'function:public.claim_jobs(text,integer,text,integer)',
    'function:public.complete_job(uuid)',
    'function:public.fail_job(uuid,text)',
    -- 0179 tournament config merge
    'function:public.merge_format_config(uuid,jsonb,timestamptz)',
    -- 0180/0184 courtside device registry + auth
    'table:public.courtside_devices',
    'function:public.courtside_register(uuid,text,text,text,text)',
    'function:public.courtside_heartbeat(uuid,text,text,text,text,integer,uuid,text)',
    -- 0181 court evidence + quality scorecards
    'table:public.court_evidence',
    'function:public.court_data_quality()',
    'function:public.ranking_data_quality()',
    -- 0182/0185 fleet status
    'function:public.courtside_fleet_status()',
    'function:public.fleet_metrics()',
    'function:public.admin_force_end_session(uuid,uuid)',
    -- 0186/0188 RUM + search metrics
    'table:public.perf_samples',
    'function:public.perf_report(integer)',
    'function:public.search_zero_rate(integer)',
    -- 0187 cheap poll head
    'function:public.queue_poll_head(uuid)',
    -- 0191/0192 privacy + queue boundaries (added by 0192)
    'function:public.profile_boundary_intact()',
    'function:public.queue_boundary_intact()',
    'function:public.courtside_authorize(uuid,text,uuid)',
    -- 0193 tournament commands
    'function:public.tournament_boundary_intact()',
    'function:public.tournament_register(uuid,uuid,uuid,jsonb,boolean,boolean)',
    'function:public.tournament_withdraw(uuid)',
    'function:public.tournament_submit_payment_proof(uuid,text)',
    'function:public.tournament_review_payment(uuid,text,text)',
    -- 0194 moderation re-entry
    'function:public.moderation_reentry_intact()',
    -- 0195 video containment
    'function:public.video_disabled_intact()',
    -- 0196 privilege hygiene
    'function:public.grant_hygiene_intact()'
  ];
  missing text[] := '{}';
  item text;
  ident text;
begin
  foreach item in array required loop
    ident := substring(item from position(':' in item) + 1);
    if item like 'table:%' then
      if to_regclass(ident) is null then
        missing := missing || (item || ' [absent]');
      end if;
    else
      if to_regprocedure(ident) is null then
        missing := missing || (item || ' [absent]');
      elsif not has_function_privilege('service_role', ident, 'EXECUTE') then
        -- The 0183 failure mode: present, but the app cannot call it.
        missing := missing || (item || ' [no service_role EXECUTE]');
      end if;
    end if;
  end loop;
  return missing;
end;
$$;

revoke all on function public.schema_manifest_missing() from public, anon, authenticated;
grant execute on function public.schema_manifest_missing() to service_role;
