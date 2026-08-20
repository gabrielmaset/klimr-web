-- 0026 — admin code management.
--
-- 1) Invite codes gain an on/off switch (investor_codes already has `active`),
--    so the admin can DISABLE a code without deleting it. The gate, the signup
--    pre-check, and the signup trigger all refuse a disabled code.
-- 2) Record which invite code each new member signed up with, surfaced on their
--    admin record.
-- 3) Let the service role (the admin server actions) call the code generators.

-- 1) on/off switch for invite codes
alter table public.invite_codes
  add column if not exists active boolean not null default true;

-- 2) the invite code a member used at signup
alter table public.profiles
  add column if not exists signup_code text;

-- Recreate the signup trigger: refuse disabled codes, and stamp signup_code.
-- (Body matches 0002 with `and active` added to the consume and signup_code added
--  to the profile insert; 0022's execute-revoke is preserved by create-or-replace.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_hit int;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  update public.invite_codes
     set uses = uses + 1, last_used_at = now()
   where code = v_code and uses < max_uses and active
   returning 1 into v_hit;
  if v_hit is null then
    raise exception 'invite_required';
  end if;

  insert into public.profiles (id, display_name, signup_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    nullif(v_code, '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3) the admin server actions (service role) call these via rpc to mint codes.
grant execute on function public.generate_invite_codes(int, int, text) to service_role;
grant execute on function public.generate_investor_codes(int, text) to service_role;
