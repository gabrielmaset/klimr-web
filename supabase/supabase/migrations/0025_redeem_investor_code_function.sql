-- 0025 — redeem_investor_code(): the investor gate's single, least-privilege
-- entry point. The klimr-investor doorman (Cloudflare Worker) calls it with the
-- public anon key to validate a code and open the portal.
--
-- It validates a code and, on the FIRST successful use, starts the 7-day clock
-- (this is where the old enterInvestor server action's logic now lives, so the
-- gate's brain is in one place — the database). SECURITY DEFINER lets it read
-- and stamp investor_codes despite RLS, while anon is granted EXECUTE on this
-- ONE function and nothing else — no other access to the table or the database.
--
-- Returns: {"valid": false}
--      or  {"valid": true, "expires_at": "<timestamptz>"}
--
-- Requires 0024 (nullable expires_at) to have run first.

create or replace function public.redeem_investor_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code        text := upper(trim(p_code));
  v_active      boolean;
  v_expires_at  timestamptz;
  v_now         timestamptz := now();
begin
  select active, expires_at
    into v_active, v_expires_at
    from public.investor_codes
   where code = v_code;

  -- Unknown or disabled code.
  if not found or v_active is not true then
    return jsonb_build_object('valid', false);
  end if;

  -- Clock has started and run out.
  if v_expires_at is not null and v_expires_at <= v_now then
    return jsonb_build_object('valid', false);
  end if;

  if v_expires_at is null then
    -- First use: start the 7-day window now.
    v_expires_at := v_now + interval '7 days';
    update public.investor_codes
       set expires_at = v_expires_at,
           last_used_at = v_now
     where code = v_code;
  else
    -- Subsequent use within the window: just record it.
    update public.investor_codes
       set last_used_at = v_now
     where code = v_code;
  end if;

  return jsonb_build_object('valid', true, 'expires_at', v_expires_at);
end;
$$;

-- Least privilege: only the anon role (the Worker's key) may call this, nothing else.
revoke all on function public.redeem_investor_code(text) from public;
grant execute on function public.redeem_investor_code(text) to anon;
