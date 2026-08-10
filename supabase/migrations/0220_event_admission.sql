-- 0220_event_admission.sql — KCDX-043 (P1): event RSVP and approval capacity
-- checks are subject to TOCTOU races.
--
-- ── TWO PATHS, TWO DIFFERENT PROBLEMS ────────────────────────────────────
-- RSVP counts the current cycle's `going` rows and then upserts. Nothing holds
-- between the count and the write, so two people tapping Going on the last seat
-- both read capacity-minus-one and both get in. Ordinary optimistic-read racing,
-- and the seat that does not exist is discovered at the court.
--
-- Approval is worse: `approveMember` sets `status = 'going'` with **no capacity
-- check whatsoever**. An organiser working through a pending list can admit
-- forty people to a twelve-person event, and nothing anywhere objects. The
-- capacity column exists; that path simply never reads it.
--
-- ── ONE ADMISSION COMMAND ────────────────────────────────────────────────
-- Both paths become the same locked command. It takes the event row lock, counts
-- under it, and decides — going, pending, waitlisted or full — then writes. The
-- decision and the write cannot be separated by anything.
--
-- Idempotent by design: RSVPing twice is not an error and does not consume a
-- second seat, because an existing `going` row short-circuits before the count.
--
-- ── WHY THE CYCLE BOUNDARY IS A PARAMETER ────────────────────────────────
-- Only the current cycle's RSVPs fill seats — a weekly game's attendance last
-- Tuesday does not occupy a seat this Tuesday. That boundary is computed by
-- `rsvpCycleStartISO` in `lib/`, which understands the recurrence rules, and
-- reimplementing it in SQL would create a second definition free to drift from
-- the first. So it is passed in, and the function is granted to `service_role`
-- ONLY — the value comes from our own server action reading the event row, never
-- from a member. A member-callable version would need the boundary computed
-- in-database, because a caller who can choose the cycle start can choose the
-- count.

create or replace function public.event_admit(
  p_event       uuid,
  p_user        uuid,
  p_cycle_start timestamptz,
  p_force_going boolean default false   -- organiser approving from the pending list
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev      record;
  v_count   int;
  v_status  text;
  v_current text;
begin
  if p_event is null or p_user is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  -- The event row is the contended resource: every seat decision for it
  -- serializes here.
  select id, capacity, join_policy into v_ev
    from public.events where id = p_event for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select status into v_current
    from public.event_rsvps where event_id = p_event and user_id = p_user;

  -- Already holding a seat: not an error, and it must not consume a second one.
  if v_current = 'going' then
    return jsonb_build_object('ok', true, 'status', 'going', 'unchanged', true);
  end if;

  v_status := case
                when p_force_going then 'going'
                when v_ev.join_policy = 'approval' then 'pending'
                else 'going'
              end;

  -- Capacity applies to anything taking a seat, INCLUDING an approval. That is
  -- the check `approveMember` never made.
  if v_status = 'going' and v_ev.capacity is not null then
    select count(*) into v_count
      from public.event_rsvps r
     where r.event_id = p_event
       and r.status = 'going'
       and (p_cycle_start is null or r.created_at > p_cycle_start);

    if v_count >= v_ev.capacity then
      -- FULL — and deliberately NOT written as a 'waitlisted' row.
      --
      -- The audit's suggested return set includes `waitlisted`, and
      -- `event_rsvps.status` permits only 'going' and 'pending'. Widening the
      -- constraint would be one line, and it would strand people: no event
      -- surface renders a waitlisted RSVP, so the person would sit in a state
      -- that is invisible to them and to the organiser, believing they had a
      -- place in line that nothing manages.
      --
      -- An event waitlist is a feature — a position, a promotion rule, a
      -- notification when a seat frees — not a status value. Until it exists,
      -- "full" is the truthful answer. A pending row is left pending so the
      -- organiser still sees the person waiting for a decision.
      return jsonb_build_object(
        'ok', false, 'error', 'full',
        'status', coalesce(v_current, 'none'),
        'capacity', v_ev.capacity);
    end if;
  end if;

  insert into public.event_rsvps (event_id, user_id, status, created_at)
  values (p_event, p_user, v_status, now())
  on conflict (event_id, user_id) do update
    set status = excluded.status, created_at = excluded.created_at;

  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

revoke all on function public.event_admit(uuid, uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.event_admit(uuid, uuid, timestamptz, boolean) to service_role;

comment on function public.event_admit is
  'KCDX-043: the ONE admission decision for an event. Locks the event, counts the current cycle under '
  'the lock, and writes — so the count and the write cannot be separated. Applies capacity to approvals '
  'too, which approveMember never did. service_role only: the cycle boundary is a parameter, and a '
  'caller who can choose it can choose the count.';

-- ── the invariant ────────────────────────────────────────────────────────
create or replace function public.event_capacity_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Non-recurring events only: for a recurring series "the current cycle" is a
  -- moving boundary this check cannot know, and guessing it would produce
  -- confident false alarms.
  select not exists (
    select 1
      from public.events e
      join public.event_rsvps r on r.event_id = e.id and r.status = 'going'
     where e.capacity is not null
       and coalesce(e.recurrence, 'none') = 'none'
     group by e.id, e.capacity
    having count(*) > e.capacity
  );
$$;

revoke all on function public.event_capacity_intact() from public, anon, authenticated;
grant execute on function public.event_capacity_intact() to service_role;
