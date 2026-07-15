-- 0118_per_listing_attestations.sql — per-listing legal audit trail:
-- each tournament records WHEN its host agreed to the organizer terms and
-- attested venue rights; each event records the host acknowledgment. These
-- are set by the create actions at publish time (dated evidence per listing,
-- not just a standing promise on the application).

alter table public.tournaments
  add column if not exists host_agreed_at timestamptz,
  add column if not exists venue_attested_at timestamptz;

alter table public.events
  add column if not exists host_ack_at timestamptz;
