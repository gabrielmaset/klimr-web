-- 0242_report_visibility_rum_budget_availability.sql — closes the three remaining
-- batch-2 findings: a report that exfiltrated posts, an unbounded anonymous
-- privileged writer, and availability search as a schedule oracle.
--
-- KRA-019 · KRA-031 · KRA-020 (all P1, re-audit 2026-08-10).

-- ═══ KRA-019 — report_post exfiltrated non-visible posts ═════════════════
-- `report_post` is SECURITY DEFINER and selected the post BY ID with no
-- visibility test at all, then wrote `body_snapshot` and `media_snapshot` into a
-- `post_reports` row the reporter is expressly allowed to read back. So a member
-- holding any post UUID — from an old share link, a notification, a deleted
-- thread — could call `report_post(uuid,'spam',null)` and read the body of a
-- private, friends-only, pending or blocked-author post out of their own report.
-- The snapshot exists to stop an author destroying evidence; it must not become
-- a way to fetch what you were never allowed to see.
--
-- The gate goes BEFORE the rate limit and BEFORE the snapshot, and returns the
-- SAME answer as a post that does not exist. Owner decision OD-3: a denial must
-- not distinguish missing / pending / private / blocked, because any
-- distinguishable answer is an existence oracle.
create or replace function public.report_post(
  p_post   uuid,
  p_reason text,
  p_detail text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_post record; v_id uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  select id, author_id, body, media_path into v_post from public.posts where id = p_post;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_post.author_id = v_me then return jsonb_build_object('ok', false, 'error', 'own_post'); end if;

  -- KRA-019. `post_visible` is evaluated under the REAL caller (it reads
  -- auth.uid(), which a SECURITY DEFINER context does not change) and already
  -- covers audience, moderation status and blocks since 0209. One answer for
  -- every refusal, matching the not-found branch above.
  if not public.post_visible(p_post) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not public.check_rate_limit('report-post:' || v_me::text, 20, 3600) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.post_reports (post_id, reporter_id, reason, detail, body_snapshot, media_snapshot)
  values (p_post, v_me, left(coalesce(p_reason, 'other'), 40), left(p_detail, 2000),
          left(coalesce(v_post.body, ''), 4000), v_post.media_path)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Preserve the media as safety evidence: the author can delete the content the
  -- moment they suspect a report, and a report that dies with its subject stops
  -- working exactly when someone is trying to escape it.
  if v_post.media_path is not null then
    insert into public.safety_incidents (kind, uploader_id, storage_path, status, detail)
    values ('post_report', v_post.author_id, v_post.media_path, 'pending',
            'post_reports:' || v_id::text)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ═══ KRA-031 — anonymous, unbounded, privileged ingestion ════════════════
-- `/api/rum` is unauthenticated by necessity (web vitals fire before and after
-- auth alike). Every syntactically valid request created a service-role client
-- and inserted a row, with no per-source limit, no global budget and no
-- backpressure. The route's own comment said the worst case was a skewed
-- dashboard; it was also unbounded database writes, storage growth, index churn
-- and project cost, driven by anyone with the URL.
--
-- The client "samples at 10%", which is a request from the server to the client
-- and not a control. The budget therefore lives HERE, where it cannot be
-- declined, and admission is what the route is allowed to do — not a raw insert.
create table if not exists public.rum_budget (
  day           date primary key,
  accepted      bigint not null default 0,
  dropped       bigint not null default 0,
  updated_at    timestamptz not null default now()
);

alter table public.rum_budget enable row level security;
revoke all on public.rum_budget from anon, authenticated;
grant all on public.rum_budget to service_role;

create or replace function public.rum_ingest(
  p_metric    text,
  p_value_ms  int,
  p_route     text,
  p_is_mobile boolean,
  p_daily_cap bigint default 200000
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_accepted bigint;
begin
  insert into public.rum_budget (day, accepted)
  values (current_date, 0)
  on conflict (day) do nothing;

  -- `for update` serializes concurrent beacons, so read-then-write is safe here
  -- and the decision is unambiguous.
  --
  -- My first version did the test and both counters inside ONE update and then
  -- inferred the outcome from the RETURNING value. At the boundary both branches
  -- leave `accepted` equal to the cap, so the inference was wrong: the 4th call
  -- against a cap of 3 counted a drop AND returned 'ok' AND inserted the sample —
  -- a budget that reports enforcing itself while letting the row through. Found
  -- by the acceptance test, not by reading it.
  select accepted into v_accepted
    from public.rum_budget where day = current_date for update;

  if v_accepted >= p_daily_cap then
    -- Observable by design: the drop is COUNTED, not silent. A budget that
    -- discards traffic without recording it is indistinguishable from a system
    -- that simply stopped receiving any.
    update public.rum_budget set dropped = dropped + 1, updated_at = now()
     where day = current_date;
    return 'over_budget';
  end if;

  update public.rum_budget set accepted = accepted + 1, updated_at = now()
   where day = current_date;

  insert into public.perf_samples (metric, value_ms, route, is_mobile)
  values (p_metric, least(greatest(p_value_ms, 0), 120000), p_route, coalesce(p_is_mobile, false));

  return 'ok';
end $$;

revoke all on function public.rum_ingest(text, int, text, boolean, bigint) from public, anon, authenticated;
grant execute on function public.rum_ingest(text, int, text, boolean, bigint) to service_role;

comment on function public.rum_ingest is
  'KRA-031: the only admission path for anonymous RUM. Enforces a daily row budget in the database, '
  'where a client cannot decline it, and COUNTS what it drops so saturation is visible rather than '
  'looking like silence.';

-- ═══ KRA-020 — availability search was a schedule oracle ═════════════════
-- `searchPlayers` reads private `profiles.availability` with a privileged client
-- and intersects exact day/time windows, while also accepting a name filter. The
-- slots are never printed, but presence/absence across repeated narrow windows
-- ("Alice Monday 18:00-18:15", then 18:15-18:30…) reconstructs the schedule.
--
-- Owner decision OD-2: availability discovery follows each member's OWN privacy
-- settings — a member who accepts requests at a given level is discoverable to
-- people at that level. So the ladder decides, exactly as it does for everything
-- else, rather than availability having a private rule of its own.
--
-- Runs as the CALLER's question: `may_act_on` is service_role-only since 0237,
-- so this wrapper is SECURITY DEFINER and binds the viewer to auth.uid().
create or replace function public.players_open_to_requests(p_ids uuid[])
returns table (player_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.id = any(p_ids)
     and public.may_act_on(auth.uid(), p.id, 'request');
$$;

revoke all on function public.players_open_to_requests(uuid[]) from public, anon;
grant execute on function public.players_open_to_requests(uuid[]) to authenticated, service_role;

comment on function public.players_open_to_requests is
  'KRA-020 / OD-2: which of these members would accept a request from the CALLER. Availability '
  'discovery is gated on the same ladder as every other action, so a member who restricts requests '
  'is not discoverable by schedule either.';

-- ═══ boundary sentinel ═══════════════════════════════════════════════════
create or replace function public.report_and_ingest_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the report gate consults visibility before snapshotting
    (select position('post_visible' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'report_post' limit 1)
    -- RUM admission is a budgeted command, and members cannot call it
    and not has_function_privilege('anon',
          'public.rum_ingest(text, int, text, boolean, bigint)', 'EXECUTE')
    and not has_function_privilege('authenticated',
          'public.rum_ingest(text, int, text, boolean, bigint)', 'EXECUTE')
    -- nobody but the server may read the budget ledger
    and not has_table_privilege('authenticated', 'public.rum_budget', 'SELECT')
    -- availability discovery is bound to the caller
    and has_function_privilege('authenticated', 'public.players_open_to_requests(uuid[])', 'EXECUTE');
$$;

revoke all on function public.report_and_ingest_intact() from anon, authenticated, public;
grant execute on function public.report_and_ingest_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 23)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
