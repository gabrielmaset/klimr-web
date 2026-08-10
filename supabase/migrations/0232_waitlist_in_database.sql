-- 0232_waitlist_in_database.sql — move the time-critical half of the waitlist
-- sweep into the database.
--
-- ── WHY ──────────────────────────────────────────────────────────────────
-- `waitlist-sweep` is the only one of eleven scheduled jobs that leaves the
-- database. It is a pg_cron job that HTTP-POSTs to a Vercel route, which runs
-- TypeScript, which expires stale offers and promotes the next person in line.
--
-- That path can fail at DNS, at TLS, at Vercel routing, at middleware
-- classification, at a secret matching between two systems — and `net.http_post`
-- never inspects its response, so none of those failures is visible from inside
-- the database.
--
-- Five of those are not hypothetical. KCDX-039 found the route being redirected
-- to a login page. And on 2026-08-10 the job returned 401 for twelve minutes
-- because a secret in one system stopped matching a string in the other, which
-- happened because I told Gabriel to paste a placeholder I had read out of the
-- CI harness and mistaken for production.
--
-- The other ten jobs are one line of SQL calling one database function. They
-- cannot fail that way because there is nothing between the scheduler and the
-- work.
--
-- ── WHAT MOVES, AND WHAT DOES NOT ────────────────────────────────────────
-- MOVES: expiring an offer whose window has passed, and promoting the next
-- person — the time-critical part, where a delay costs somebody their slot.
-- Both already exist as commands: `match_promote_waitlist` (0221) does the
-- promotion under a lock.
--
-- STAYS ON HTTP: the notification email. Email needs a template, a vendor and a
-- retry, none of which belong in plpgsql — and a late email is survivable in a
-- way that a late promotion is not. The route keeps doing that, and now has one
-- job instead of two.
--
-- The split is the point: the part that must be right runs where nothing can
-- silently sit between the schedule and the work.

create or replace function public.sweep_waitlists(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m         record;
  v_expired   int := 0;
  v_promoted  int := 0;
  v_offered   jsonb := '[]'::jsonb;
  v_res       jsonb;
begin
  -- Expire first, so the slots they were holding are free before promotion runs.
  -- Set-based: an offer past its window is stale regardless of which match it
  -- belongs to.
  update public.join_requests
     set status = 'waitlisted', offered_at = null, offer_expires_at = null
   where status = 'offered' and offer_expires_at < now();
  get diagnostics v_expired = row_count;

  -- Then promote, one match at a time, each inside `match_promote_waitlist`'s
  -- own lock. Only matches that could actually take somebody are considered, so
  -- this does not walk every open match on the platform.
  for v_m in
    select m.id
      from public.matches m
     where m.status = 'open'
       and m.scheduled_at > now()
       and exists (select 1 from public.join_requests j
                    where j.match_id = m.id and j.status = 'waitlisted')
       and (select count(*) from public.match_participants p where p.match_id = m.id) < m.total_slots
     order by m.scheduled_at
     limit p_limit
  loop
    v_res := public.match_promote_waitlist(v_m.id, 30);
    if coalesce((v_res->>'offered')::int, 0) > 0 then
      v_promoted := v_promoted + (v_res->>'offered')::int;
      v_offered := v_offered || coalesce(v_res->'offered_to', '[]'::jsonb);
    end if;
  end loop;

  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'offered_to', v_offered);
end;
$$;

revoke all on function public.sweep_waitlists(integer) from public, anon, authenticated;
grant execute on function public.sweep_waitlists(integer) to service_role;

comment on function public.sweep_waitlists is
  'KCDX-044/053: expires stale offers and promotes the next player, in-database. Replaces the HTTP leg '
  'of `waitlist-sweep`, which could fail at DNS, TLS, routing, middleware or a secret mismatch and '
  'reported none of them. The notification email stays on the route: a late email is survivable, a late '
  'promotion is not.';

-- ── the schedule ─────────────────────────────────────────────────────────
-- Every minute, like before, but calling SQL directly. The command is replaced
-- rather than added: `cron.schedule` on an existing name updates it in real
-- pg_cron, and the unschedule first makes that true everywhere.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice '0232: cron.schedule unavailable — skipping';
    return;
  end if;
  begin
    perform cron.unschedule('waitlist-sweep');
  exception when others then null;
  end;
  perform cron.schedule('waitlist-sweep', '* * * * *', 'select public.sweep_waitlists()');
  raise notice '0232: waitlist-sweep now calls sweep_waitlists() directly';
end $$;

-- The HTTP route is NOT deleted. It still sends the offer emails, and it is now
-- driven by the promotion rather than driving it. Notifying someone who was
-- promoted is a job for the layer that can render a template and retry a vendor.
