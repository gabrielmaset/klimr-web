-- 0055_mfa_lockout_hook.sql — brute-force lockout on the 2FA (TOTP) step.
--
-- Supabase rate-limits MFA verification, but does not lock an account after N wrong
-- codes. This hook adds that: after 5 incorrect codes within 15 minutes, the factor
-- is locked for 15 minutes (HTTP 429); a correct code clears the counter.
--
-- AFTER RUNNING THIS MIGRATION you must enable the hook in the dashboard:
--   Authentication > Hooks > "MFA Verification Attempt"
--   → select  public.hook_mfa_verification_attempt
-- Hooks run as the supabase_auth_admin role, which is granted below.

create table if not exists public.mfa_failed_verification_attempts (
  user_id        uuid not null,
  factor_id      uuid not null,
  failed_count   int not null default 0,
  last_failed_at timestamptz not null default now(),
  locked_until   timestamptz,
  primary key (user_id, factor_id)
);

alter table public.mfa_failed_verification_attempts enable row level security;
-- Only the auth admin (the role the hook runs as) may touch this table.
revoke all on table public.mfa_failed_verification_attempts from anon, authenticated, public;
grant all on table public.mfa_failed_verification_attempts to supabase_auth_admin;

create or replace function public.hook_mfa_verification_attempt(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id   uuid := (event->>'user_id')::uuid;
  v_factor_id uuid := (event->>'factor_id')::uuid;
  v_valid     boolean := coalesce((event->>'valid')::boolean, false);
  v_row       public.mfa_failed_verification_attempts%rowtype;
  v_window    interval := interval '15 minutes';   -- window over which failures accumulate
  v_max       int := 5;                            -- wrong codes allowed before lockout
  v_cooldown  interval := interval '15 minutes';   -- how long the lockout lasts
begin
  select * into v_row
    from public.mfa_failed_verification_attempts
    where user_id = v_user_id and factor_id = v_factor_id;

  -- Locked out → reject regardless of the code entered.
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 429,
      'message', 'Too many incorrect codes. Try again in a few minutes.'));
  end if;

  -- Correct code → clear the record and let auth proceed.
  if v_valid then
    delete from public.mfa_failed_verification_attempts
      where user_id = v_user_id and factor_id = v_factor_id;
    return jsonb_build_object('decision', 'continue');
  end if;

  -- Incorrect code → record the failure (resetting the counter if the window lapsed).
  if v_row.user_id is null then
    insert into public.mfa_failed_verification_attempts (user_id, factor_id, failed_count, last_failed_at)
      values (v_user_id, v_factor_id, 1, now());
  elsif now() - v_row.last_failed_at > v_window then
    update public.mfa_failed_verification_attempts
      set failed_count = 1, last_failed_at = now(), locked_until = null
      where user_id = v_user_id and factor_id = v_factor_id;
  else
    update public.mfa_failed_verification_attempts
      set failed_count = v_row.failed_count + 1,
          last_failed_at = now(),
          locked_until = case when v_row.failed_count + 1 >= v_max then now() + v_cooldown else null end
      where user_id = v_user_id and factor_id = v_factor_id;
    if v_row.failed_count + 1 >= v_max then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 429,
        'message', 'Too many incorrect codes. Your account is locked for 15 minutes.'));
    end if;
  end if;

  -- Otherwise let Supabase Auth apply its normal wrong-code handling.
  return jsonb_build_object('decision', 'continue');
end; $$;

revoke all on function public.hook_mfa_verification_attempt(jsonb) from anon, authenticated, public;
grant execute on function public.hook_mfa_verification_attempt(jsonb) to supabase_auth_admin;
