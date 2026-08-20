-- 0276_courtside_containment.sql — C0: revoke the public-code operator path.
-- KFU-001 containment (NOT the permanent fix). Owner-authorized 2026-08-17:
-- Courtside displays go dark until the organizer-issued enrollment package
-- ships. This closes the P0 exposure — a public join/display code minting an
-- operator-capable device token — at the database boundary, so it holds even
-- against a direct call to the register path.
--
-- Two overloads of courtside_register exist on this schema — (uuid,...) from
-- 0184 and (text,...) from the 0263 rollback. BOTH can mint a token, so both
-- are neutralized. Existing device tokens are revoked so a token minted before
-- today cannot continue to act (the operator guard checks revoked_at).
-- Fully reversible: the permanent package replaces these outright.

-- 1. Revoke existing device tokens.
update public.courtside_devices
   set revoked_at = now()
 where revoked_at is null;

-- 2a. Neutralize the (text,...) overload.
create or replace function public.courtside_register(
  p_install_id text,
  p_code text,
  p_token_hash text,
  p_platform text default null,
  p_app_version text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'courtside_enrollment_disabled'
    using errcode = 'P0001',
          hint = 'Courtside enrollment is disabled pending the organizer-issued enrollment release (KFU-001).';
end;
$$;

-- 2b. Neutralize the (uuid,...) overload.
create or replace function public.courtside_register(
  p_install_id uuid,
  p_code text,
  p_token_hash text,
  p_platform text default null,
  p_app_version text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'courtside_enrollment_disabled'
    using errcode = 'P0001',
          hint = 'Courtside enrollment is disabled pending the organizer-issued enrollment release (KFU-001).';
end;
$$;

-- 3. Revoke EXECUTE on both overloads from every non-service role, fully
--    qualified so neither is ambiguous.
revoke all on function public.courtside_register(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.courtside_register(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.courtside_register(text, text, text, text, text) to service_role;
grant execute on function public.courtside_register(uuid, text, text, text, text) to service_role;

comment on function public.courtside_register(text, text, text, text, text) is
  'CONTAINED 2026-08-17 (KFU-001, C0): disabled. Minting a Courtside operator token from a public '
  'join/display code was the P0. Re-enabled only by the organizer-issued one-time-enrollment release.';

select public.journal_migration('0276', '0276_courtside_containment.sql', null,
  'C0 containment for KFU-001: existing Courtside device tokens revoked and BOTH courtside_register overloads (uuid and text) disabled at the database boundary until organizer-issued enrollment ships. Reversible; displays intentionally dark.');
