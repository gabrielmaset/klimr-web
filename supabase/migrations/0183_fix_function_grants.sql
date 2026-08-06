-- 0183_fix_function_grants.sql — REPAIR: restore service_role EXECUTE on the
-- functions added in 0176–0182.
--
-- THE BUG. Every function I added in 0176–0182 ended with a line like:
--     revoke all on function public.place_on_team(...) from anon, authenticated, public;
-- The intent was right — these are server-only functions and no browser client
-- should reach them. But `REVOKE ... FROM PUBLIC` also removes the IMPLICIT
-- EXECUTE grant that PostgreSQL gives every role at CREATE FUNCTION time, and
-- `service_role` — the role the application itself runs as — was relying on it
-- unless the project separately grants functions to service_role by default.
-- Net effect: the app calls the function and Postgres answers
-- "permission denied for function ...". Live symptom: joining a queue fails
-- with "Couldn't join — try again."
--
-- WHY MY VERIFICATION MISSED IT. The scratch-cluster harness proved each
-- function's LOGIC while connected as `postgres`, a superuser — which bypasses
-- permission checks entirely, so the revoke was never actually exercised. The
-- harness now has a service_role probe (see supabase/tests/) so a permission
-- regression fails before delivery rather than at a venue.
--
-- THE FIX. Grant EXECUTE explicitly to service_role. Proven in the scratch
-- cluster: the grant restores the app's access and anon/authenticated remain
-- denied, so the security intent of the original revoke is fully preserved.
--
-- SAFE + IDEMPOTENT: grants only, no logic changes, re-runnable. If the project
-- already granted functions to service_role by default, every statement here is
-- a harmless no-op. Not risky, no backup needed. RUN THIS AS SOON AS POSSIBLE
-- if 0176–0182 are already applied — queue joins stay broken until it lands.

-- 0176 — atomic queue placement (this is the one that breaks joining)
grant execute on function public.place_on_team(uuid, uuid, text, text) to service_role;

-- 0177 — queue state version (poll path; degrades silently, so it hid the fault)
grant execute on function public.queue_version(uuid) to service_role;

-- 0178 — durable jobs
grant execute on function public.enqueue_job(text, jsonb, text, timestamptz, int, text) to service_role;
grant execute on function public.claim_jobs(text, int, text, int) to service_role;
grant execute on function public.complete_job(uuid) to service_role;
grant execute on function public.fail_job(uuid, text) to service_role;
grant execute on function public.replay_job(uuid) to service_role;

-- 0179 — tournament config merge
grant execute on function public.merge_format_config(uuid, jsonb, timestamptz) to service_role;

-- 0180 — courtside device heartbeat
grant execute on function public.courtside_heartbeat(uuid, text, text, text, int, uuid, text) to service_role;

-- 0181 — data-quality scorecards
grant execute on function public.court_data_quality() to service_role;
grant execute on function public.ranking_data_quality() to service_role;

-- 0182 — courtside fleet status
grant execute on function public.courtside_fleet_status() to service_role;
grant execute on function public.courtside_device_tiers() to service_role;

-- Table access for the same reason: 0176/0177/0178/0180/0181 each revoked table
-- privileges from public, and the app reads several of these directly through
-- the service-role client (admin consoles, the jobs worker, device screens).
grant select, insert, update, delete on table public.queue_command_log     to service_role;
grant select, insert, update, delete on table public.queue_session_version to service_role;
grant select, insert, update, delete on table public.jobs                  to service_role;
grant select, insert, update, delete on table public.courtside_devices     to service_role;
grant select, insert, update, delete on table public.court_evidence        to service_role;

-- NOTE on rank_snapshots (0174): deliberately NOT granted. That table is
-- written only by a SECURITY DEFINER function, which runs as its owner and
-- needs no grant — the lockdown there is correct and stays as it is.
