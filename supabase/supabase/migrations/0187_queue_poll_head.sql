-- 0187_queue_poll_head.sql — make the cheap poll actually cheap (fixes K2-02).
--
-- WHAT I GOT WRONG. K2-02 added ETag/304 responses to /api/queue/[id] and I
-- described the saving as "round trips 7 → 1 on an unchanged poll". It was not.
-- The route read the version, then called `loadSessionState()` — all five
-- queries — and only THEN compared the ETag. Every unchanged poll still paid
-- full price server-side; the 304 saved JSON serialization and payload bytes
-- and nothing else. Caught while instrumenting the same path for K3-05, when a
-- guardrail asserting "304s are excluded from the percentile" failed and the
-- reason turned out to be that there was no cheap path to exclude.
--
-- WHY IT COULD NOT SIMPLY BE REORDERED. The ETag encodes the AUDIENCE
-- (organizer / player / public), because those payloads differ and must never
-- share a cache entry. Audience needs the session's organizer_id, which the
-- route was reading off the fully-loaded state — so the ETag could not be
-- computed before the expensive load.
--
-- FIX. One function returning both facts the poll needs before it can decide:
-- the state version and the organizer id. One round trip, primary-key targeted.
-- The route computes the ETag from that, returns 304 immediately when nothing
-- has changed, and loads the full snapshot only when it must.
--
-- Cost of an unchanged poll: 1 query, no snapshot, no JSON. At pilot×10 that is
-- ~4,200 polls/minute that now genuinely skip the work.
--
-- NOT RISKY: one read-only function. Backup not required.

create or replace function public.queue_poll_head(p_session_id uuid)
returns table (version bigint, organizer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select v.version from public.queue_session_version v
               where v.session_id = p_session_id), 0)::bigint,
    (select s.organizer_id from public.court_sessions s where s.id = p_session_id);
$$;

revoke all on function public.queue_poll_head(uuid) from anon, authenticated, public;
grant execute on function public.queue_poll_head(uuid) to service_role;
