-- 0046_code_email.sql — let an admin email a generated access code straight from
-- the Codes page. We record which address each code was emailed to so it shows in
-- the codes table. Applies to both invite codes and investor codes. Idempotent.

alter table public.invite_codes   add column if not exists sent_to_email text;
alter table public.investor_codes add column if not exists sent_to_email text;
