-- 0173_match_waitlist_offers.sql — waitlist offer machinery (PART 2 of 2).
-- Run AFTER 0172 has committed. Adds the offer columns and indexes, and
-- schedules the minute sweep: when a spot opens, the first in line gets an
-- OFFER with a deadline keyed to how soon the match starts (<=4h: 20 min;
-- <=24h: 1 hour; further out: 4 hours). Unconfirmed offers expire, the next
-- player is called, and expired players may rejoin at the back. Offered
-- spots are RESERVED. Transitions run app-side in lib/match-waitlist.ts;
-- pg_cron pings the sweep route every minute so expiries cascade.
--
-- BEFORE RUNNING: replace REPLACE_WITH_SECRET below with a long random
-- string, and set the same value as WAITLIST_CRON_SECRET in Vercel env.

alter table public.join_requests
  add column if not exists offered_at timestamptz,
  add column if not exists offer_expires_at timestamptz;

create index if not exists join_requests_waitlist_idx
  on public.join_requests (match_id, status, created_at);
create index if not exists join_requests_offer_expiry_idx
  on public.join_requests (offer_expires_at)
  where status = 'offered';

-- Minute sweep: expire overdue offers and call the next player in line.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('waitlist-sweep')
where exists (select 1 from cron.job where jobname = 'waitlist-sweep');

select cron.schedule(
  'waitlist-sweep',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://www.klimr.com/api/cron/waitlist-sweep',
    headers := '{"x-cron-secret": "REPLACE_WITH_SECRET"}'::jsonb
  )
  $$
);
