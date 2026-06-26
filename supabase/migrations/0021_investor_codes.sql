-- 0021_investor_codes.sql
-- Access codes for the INVESTOR demo gate (investor.klimr.com / the footer link).
-- You create these exactly like invite codes, but they live in their own table so
-- an investor code can never be used to sign up, and a member invite can never
-- unlock the investor demo. The gate validates a code server-side via the
-- service-role client; RLS locks this table to everyone else.

create table if not exists public.investor_codes (
  code         text primary key
                 check (code = upper(code) and char_length(code) between 8 and 40),
  label        text,
  active       boolean not null default true,
  -- Investor codes expire 7 days after they're minted. The gate also enforces
  -- this at entry; change the interval here if you want a different window.
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.investor_codes enable row level security;
-- No policies on purpose: only the server-side gate action (service-role client)
-- may read or write this table. anon / authenticated get nothing.
revoke all on public.investor_codes from anon, authenticated;
grant all on public.investor_codes to service_role;

-- Mint codes from the Supabase SQL editor, e.g.:
--   select * from public.generate_investor_codes(5, 'seed round');
-- Returns the freshly-created codes. Format: INV-XXXX-XXXX (unambiguous chars).
-- Each code is valid for 7 days from creation (expires_at default above).
-- Deactivate one early with: update public.investor_codes set active=false where code='INV-....';
create or replace function public.generate_investor_codes(p_count int, p_note text default null)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
begin
  for i in 1..greatest(p_count, 1) loop
    loop
      v_code := 'INV-';
      for k in 1..4 loop
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      v_code := v_code || '-';
      for k in 1..4 loop
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.investor_codes where code = v_code);
    end loop;
    insert into public.investor_codes (code, label) values (v_code, p_note);
    return next v_code;
  end loop;
end;
$$;

-- The minting function is privileged; keep it out of client-reachable roles.
revoke all on function public.generate_investor_codes(int, text) from public, anon, authenticated;
