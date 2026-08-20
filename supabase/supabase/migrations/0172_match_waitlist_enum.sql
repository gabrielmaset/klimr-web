-- 0172_match_waitlist_enum.sql — waitlist offer statuses (PART 1 of 2).
-- Postgres forbids USING a new enum value in the transaction that adds it,
-- and the SQL editor runs each paste as one transaction — so the enum
-- additions live alone here, and 0173 (columns, indexes, cron) runs as a
-- SEPARATE paste afterwards.

alter type public.join_status add value if not exists 'offered';
alter type public.join_status add value if not exists 'joined';
alter type public.join_status add value if not exists 'expired';
