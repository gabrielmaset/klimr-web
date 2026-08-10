-- 0221_waitlist_commands.sql — KCDX-044 (P1): open-play waitlist reservations
-- are not one atomic durable state machine.
--
-- ── CONFIRMING AN OFFER ──────────────────────────────────────────────────
-- `confirmOffer` is five steps: read the offer, check it is `offered` and
-- unexpired; read the match, check it is open; COUNT participants against
-- `total_slots`; insert the participant; mark the offer `joined`.
--
-- Nothing holds across those steps. Two people whose offers arrived together —
-- which is the normal case, because promotion offers several at once — both
-- count slots-minus-one and both insert. The match is overfilled, and the person
-- who finds out is whoever gets turned away at the court.
--
-- The last two steps are also unrelated to each other. If the participant insert
-- succeeds and the `join_requests` update does not, the player is in the match
-- while their offer still reads `offered`: the sweep can expire an offer that
-- was already taken, and the participant row survives it.
--
-- ── PROMOTING FROM THE LINE ──────────────────────────────────────────────
-- `promoteForMatch` computes free slots as `total_slots − filled − activeOffers`
-- from two independent counts, then walks the FIFO line issuing offers one at a
-- time, ignoring errors (`if (error) continue`). Two promotions running together
-- — a sweep and a decline, say — can each believe the same slot is free.
--
-- ── ONE COMMAND EACH, WITH THE MATCH LOCKED ──────────────────────────────
-- The match row is the contended resource for both. Locking it makes the count
-- and the write inseparable, and makes the two commands serialize against each
-- other rather than racing over the same free slot.

create or replace function public.match_confirm_offer(
  p_match uuid,
  p_user  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_m record; v_req record; v_filled int;
begin
  -- Lock the match first: every seat decision for it serializes here, including
  -- promotion below.
  select id, total_slots, status, organizer_id into v_m
    from public.matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if v_m.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;

  select * into v_req from public.join_requests
   where match_id = p_match and requester_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_offer'); end if;

  -- Already in: idempotent, and it must not consume a second slot.
  if exists (select 1 from public.match_participants where match_id = p_match and user_id = p_user) then
    update public.join_requests set status = 'joined' where id = v_req.id;
    return jsonb_build_object('ok', true, 'already_in', true);
  end if;

  if v_req.status <> 'offered' then return jsonb_build_object('ok', false, 'reason', 'no_offer'); end if;
  if v_req.offer_expires_at is null or v_req.offer_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select count(*) into v_filled from public.match_participants where match_id = p_match;
  if v_filled >= v_m.total_slots then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  -- Both writes, together. Previously the participant could land while the
  -- offer stayed `offered`, so a sweep could expire an offer already taken.
  insert into public.match_participants (match_id, user_id, joined_at)
  values (p_match, p_user, now())
  on conflict (match_id, user_id) do nothing;

  update public.join_requests set status = 'joined' where id = v_req.id;

  return jsonb_build_object('ok', true, 'organizer_id', v_m.organizer_id);
end;
$$;

-- ── promotion: compute free slots and issue offers in one transaction ─────
create or replace function public.match_promote_waitlist(
  p_match       uuid,
  p_offer_mins  integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m      record;
  v_filled int;
  v_offers int;
  v_free   int;
  v_row    record;
  v_made   int := 0;
  v_ids    uuid[] := '{}';
begin
  select id, total_slots, status into v_m
    from public.matches where id = p_match for update;
  if not found or v_m.status <> 'open' then
    return jsonb_build_object('ok', true, 'offered', 0);
  end if;

  -- Both counts under the same lock, so "free" is a fact rather than a guess
  -- assembled from two independent reads.
  select count(*) into v_filled from public.match_participants where match_id = p_match;
  select count(*) into v_offers from public.join_requests
   where match_id = p_match and status = 'offered' and offer_expires_at > now();

  v_free := v_m.total_slots - v_filled - v_offers;
  if v_free <= 0 then return jsonb_build_object('ok', true, 'offered', 0); end if;

  for v_row in
    select id, requester_id from public.join_requests
     where match_id = p_match and status = 'waitlisted'
     order by waitlist_position nulls last, created_at
     limit v_free
     for update skip locked            -- another promotion cannot claim the same row
  loop
    update public.join_requests
       set status = 'offered',
           offered_at = now(),
           offer_expires_at = now() + make_interval(mins => greatest(p_offer_mins, 1)),
           waitlist_position = null
     where id = v_row.id and status = 'waitlisted';
    if found then
      v_made := v_made + 1;
      v_ids := v_ids || v_row.requester_id;
    end if;
  end loop;

  -- Renumber what is left, so the line the member sees is the line that exists.
  with ordered as (
    select id, row_number() over (order by waitlist_position nulls last, created_at) rn
      from public.join_requests
     where match_id = p_match and status = 'waitlisted'
  )
  update public.join_requests j
     set waitlist_position = o.rn
    from ordered o
   where j.id = o.id and j.waitlist_position is distinct from o.rn;

  return jsonb_build_object('ok', true, 'offered', v_made, 'offered_to', to_jsonb(v_ids));
end;
$$;

revoke all on function public.match_confirm_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.match_promote_waitlist(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_confirm_offer(uuid, uuid) to service_role;
grant execute on function public.match_promote_waitlist(uuid, integer) to service_role;

comment on function public.match_confirm_offer is
  'KCDX-044: claiming an offered slot, with the match locked — the count and the participant insert '
  'cannot be separated, and the offer is marked joined in the same transaction so a sweep can never '
  'expire an offer that was already taken.';

create or replace function public.match_capacity_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.matches m
      join public.match_participants p on p.match_id = m.id
     group by m.id, m.total_slots
    having count(*) > m.total_slots
  );
$$;

revoke all on function public.match_capacity_intact() from public, anon, authenticated;
grant execute on function public.match_capacity_intact() to service_role;
