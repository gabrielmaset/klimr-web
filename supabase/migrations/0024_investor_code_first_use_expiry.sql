-- 0024 — Investor codes: start the 7-day clock at FIRST USE, not at creation.
--
-- Before: expires_at defaulted to now() + 7 days the moment a code was minted,
-- so a code you generated today silently died in a week even if no investor
-- ever opened it. After: expires_at stays NULL until the first successful
-- entry; enterInvestor() then stamps now() + 7 days. An unused code waits
-- indefinitely, then runs for exactly one week from when someone first uses it.
--
-- MUST ship together with the matching enterInvestor() change — on its own this
-- leaves every code with a null expiry, which the old action read as "expired".

alter table public.investor_codes
  alter column expires_at drop default,
  alter column expires_at drop not null;

-- Reset existing codes into the first-use model.

-- Never opened yet → clock hasn't started.
update public.investor_codes
   set expires_at = null
 where last_used_at is null;

-- Already used → run their week from when they were first entered. We only
-- track last_used_at, which equals first use for codes used a single time.
update public.investor_codes
   set expires_at = last_used_at + interval '7 days'
 where last_used_at is not null;
