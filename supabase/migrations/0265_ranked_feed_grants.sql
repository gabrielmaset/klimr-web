-- 0265_ranked_feed_grants.sql — adds the explicit EXECUTE grants 0250 forgot on
-- the five-argument get_ranked_feed.
--
-- WHAT WAS WRONG. 0250 dropped `get_ranked_feed(text, int)` — which carried an
-- explicit `grant execute … to authenticated` from 0157/0229 — and created the
-- five-argument form with NO grant statement at all. Every other RPC the
-- application calls has an explicit revoke/grant pair; a catalog audit of all 94
-- app-called RPC names against the replayed head found exactly ONE function that
-- neither `authenticated` nor `service_role` may execute, and it is this one.
--
-- WHY IT (PROBABLY) STILL WORKED IN PRODUCTION. Supabase's platform baseline sets
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,
-- authenticated, service_role`, so on the hosted database the new function was
-- born with those grants, and 0239's event trigger (where permitted) strips only
-- `public, anon`. The member feed therefore rode on an implicit, platform-owned
-- default that this project controls nowhere — the exact dependence the 0239
-- sweep exists to remove. On the replay harness, which had no function default
-- privileges, the ranker was executable by nobody but postgres, which is how the
-- omission was caught.
--
-- This migration makes the intended state explicit and deterministic in every
-- environment. On production it is expected to be a re-affirmation, not a repair;
-- if `has_function_privilege('authenticated', …)` was somehow already false
-- there, this is the fix for a member-invisible ranked feed.

revoke all on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.get_ranked_feed(text, int, double precision, double precision, double precision)
  to authenticated, service_role;

select public.journal_migration('0265', '0265_ranked_feed_grants.sql', null,
  'Explicit EXECUTE grants for get_ranked_feed(5-arg); 0250 relied on platform default privileges.');
