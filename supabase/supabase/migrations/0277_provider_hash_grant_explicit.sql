-- 0277_provider_hash_grant_explicit.sql — H2 (database half of KFU-005).
--
-- FINDING. 0245's SECURITY INVOKER trigger freeze_submitted_application calls
-- provider_application_hash() during an authenticated member's INSERT/UPDATE on
-- provider_applications. 0239 swept default PUBLIC execute from every function.
-- The auditor read this statically as "the trigger caller gets permission
-- denied."
--
-- EXECUTED FINDING (this is why we run, not read). On a full-migration head,
-- the authenticated INSERT SUCCEEDS: provider_application_hash carries an
-- `authenticated` grant. It is not in any migration's source — it arrives from
-- the platform default privileges the shim models, because 0245 CREATEs the
-- function after 0239's sweep and default privileges re-grant `authenticated`
-- at creation time. So the defect is not "broken on head" — it is "correct on
-- head ONLY because default-privilege timing happens to favor it, which is not
-- guaranteed to match production and is invisible to the reader."
--
-- FIX. Make the grant EXPLICIT and INTENTIONAL rather than incidental, and make
-- it least-privilege: the trigger helper needs exactly `authenticated` (member
-- writes) and `service_role`. This removes the dependency on default-privilege
-- ordering, makes production match head by construction, and documents intent.
-- Idempotent and safe whether or not the incidental grant is present.

revoke all on function public.provider_application_hash(public.provider_applications)
  from public, anon;
grant execute on function public.provider_application_hash(public.provider_applications)
  to authenticated, service_role;

comment on function public.provider_application_hash is
  'Content hash for provider applications. EXECUTE granted explicitly to authenticated + service_role '
  '(0277): the SECURITY INVOKER freeze trigger calls it during member writes, so the grant must be '
  'intentional, not inherited from default-privilege creation order (KFU-005).';

select public.journal_migration('0277', '0277_provider_hash_grant_explicit.sql', null,
  'KFU-005 database half: provider_application_hash gets an explicit least-privilege authenticated+service_role EXECUTE grant so the invoker freeze trigger no longer depends on incidental default-privilege ordering that may differ in production.');
