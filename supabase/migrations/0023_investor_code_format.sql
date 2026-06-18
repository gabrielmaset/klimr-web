-- ============================================================
-- 0023 — Investor codes: match the invite-code format
-- Run AFTER 0021_investor_codes.sql. Safe to run more than once.
-- ============================================================
-- Investor codes were minted as INV-XXXX-XXXX. The prefix gave away that a
-- code was an investor code, which we don't want. This switches them to the
-- SAME anonymous format as invite codes: XXXX-XXXX-XXXX (three 4-char blocks,
-- no prefix), from the same no-lookalike alphabet (no I, L, O, 0 or 1).
--
-- The investor_codes `code` check (uppercase, length 8–40) already permits the
-- new 14-char format, so no constraint change is needed.

-- 1) Clear UNUSED codes still in the old INV- format — you re-mint below.
--    Any already-redeemed code (last_used_at set) is left as a record of use.
delete from public.investor_codes
 where code like 'INV-%'
   and last_used_at is null;

-- 2) Redefine the generator to mint the invite-style format.
create or replace function public.generate_investor_codes(p_count int, p_note text default null)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- same as invite codes; no I/L/O/0/1
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
        insert into public.investor_codes (code, label) values (v_code, p_note);
        exit;
      exception when unique_violation then
        null; -- astronomically unlikely collision: roll again
      end;
    end loop;
    return next v_code;
  end loop;
end;
$$;

-- 3) Keep the minting function privileged (re-asserted; harmless if already set).
revoke all on function public.generate_investor_codes(int, text) from public, anon, authenticated;
