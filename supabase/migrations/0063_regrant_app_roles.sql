-- 0063_regrant_app_roles.sql — re-assert table grants after the tournament
-- tables (0049–0062) were added.
--
-- 0043 set ALTER DEFAULT PRIVILEGES so tables created by later migrations would
-- inherit role grants automatically. In practice the tournament tables did NOT
-- pick them up: they have RLS enabled with correct per-row policies but no
-- table-level GRANT for `authenticated`, so every insert/update returned 42501
-- ("permission denied"). The service role used in admin testing bypasses table
-- grants, which kept the bug hidden. This re-applies the explicit grants across
-- the whole schema. RLS remains the security boundary; these grants are coarse.
-- Fully idempotent — safe to run any number of times.

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, anon, service_role;

-- handle_new_user is trigger-only (0022); keep it un-executable directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
