-- 0043_grant_app_roles.sql — fix silent 42501 "permission denied" errors.
--
-- Several tables (user_preferences, feed_items, friendships, follows, match_invites,
-- court_checkins, …) have RLS enabled with correct per-row policies, but the
-- underlying table GRANTs for the `authenticated` role were never applied. In
-- Postgres, RLS policies are only consulted AFTER the role passes the table-level
-- privilege check — so with no GRANT, every read/write returns 42501 regardless of
-- policy. That's why "Save changes" failed (42501) and why the curated Feed showed
-- empty (the read errored and the page fell back to the empty state) even though
-- the admin "Post to Feed" succeeded via the service role.
--
-- RLS remains the security boundary. These grants are coarse (table-level); the
-- row-level policies still decide exactly which rows each user can see or change.
-- Every table in this schema has RLS enabled, so broad grants are safe here — this
-- mirrors Supabase's own default posture for the anon/authenticated roles.
-- Fully idempotent.

grant usage on schema public to anon, authenticated, service_role;

-- authenticated: full DML on every table — RLS restricts to the user's own rows.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- anon: read-only. Only tables with an explicit `to anon` policy (sports, zip_regions)
-- actually expose any rows; everything else is denied by RLS.
grant select on all tables in schema public to anon;

-- service_role bypasses RLS but still needs the table grants.
grant all on all tables in schema public to service_role;

-- Sequences (for any serial/identity columns) so inserts can advance them.
grant usage, select on all sequences in schema public to authenticated, anon, service_role;

-- Make sure tables created by FUTURE migrations inherit the same grants, so this
-- class of bug doesn't come back.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, anon, service_role;
