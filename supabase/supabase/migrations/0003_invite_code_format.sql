-- ============================================================
-- 0003 — Invite codes v2: anonymous triple-block format
-- Run AFTER 0002_accounts_v2.sql. Safe to run more than once.
-- ============================================================
-- New format: XXXX-XXXX-XXXX (e.g. X7QM-K2NF-B9G3) from a no-lookalike
-- alphabet (no I, L, O, 0 or 1). ~59 bits of randomness, and codes no
-- longer reveal what they belong to.

-- 1) Remove UNUSED codes in the old KLIMR- format — you re-mint below.
--    Codes that were already redeemed stay, as the record of their use.
delete from public.invite_codes
 where uses = 0
   and code !~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$';

-- 2) Only the new format may be created from now on. Existing redeemed
--    rows are grandfathered (NOT VALID skips checking old rows).
alter table public.invite_codes drop constraint if exists invite_code_format;
alter table public.invite_codes add constraint invite_code_format
  check (code ~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$') not valid;

-- 3) The generator now mints the new format.
create or replace function public.generate_invite_codes(
  p_count int default 1,
  p_max_uses int default 1,
  p_note text default null
) returns setof text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  for i in 1..greatest(p_count, 1) loop
    loop
      v_code := '';
      for j in 1..3 loop
        v_code := v_code
          || case when j > 1 then '-' else '' end
          || array_to_string(array(
               select substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1)
               from generate_series(1, 4)), '');
      end loop;
      begin
        insert into public.invite_codes (code, max_uses, note)
        values (v_code, p_max_uses, p_note);
        exit;
      exception when unique_violation then
        null; -- astronomically unlikely collision: roll again
      end;
    end loop;
    return next v_code;
  end loop;
end; $$;

-- 4) Generator stays founder-only (re-asserted; harmless if already set).
revoke execute on function public.generate_invite_codes(int, int, text) from public;
revoke execute on function public.generate_invite_codes(int, int, text) from anon;
revoke execute on function public.generate_invite_codes(int, int, text) from authenticated;
