-- 0033_recurrence_and_feed_grant.sql
-- 1) matches.recurrence — how often a recurring game repeats (weekly/biweekly/monthly).
-- 2) Make the service-role grant on feed_items explicit, so admin "Post to Feed"
--    writes succeed even if default grants didn't cover the table (mirrors 0031).
-- Idempotent.

alter table public.matches add column if not exists recurrence text;

grant all on public.feed_items to service_role;
