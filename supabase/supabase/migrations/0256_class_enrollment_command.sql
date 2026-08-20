-- 0256_class_enrollment_command.sql — enrolling is one locked command, and a
-- recorded payment is never erased by a re-join.
--
-- KRA-033 (P1, re-audit 2026-08-10). `enrollInSession` reads the session, reads
-- the class, reads the existing enrollment, COUNTS active enrollments, and then
-- writes — five round trips with no lock between the count and the insert. Three
-- separate defects live in that gap.
--
-- 1. OVERBOOKING. Two members enrolling for the last seat both count `taken =
--    cap - 1`, both conclude there is room, and both insert. The class is over
--    capacity and nothing errors — the unique key is on (session_id, user_id), so
--    it cannot see a capacity breach. A coach discovers it when too many people
--    arrive.
--
-- 2. A RECORDED PAYMENT ERASED. Re-activating a cancelled enrollment recomputes
--    `payment_status` from scratch: `cls.is_paid ? 'pending' : 'not_required'`.
--    A member who had PAID, cancelled, and re-joined came back as 'pending' — or,
--    if the coach had since made the class free, as 'not_required', erasing the
--    record that money had changed hands. The owner's directive about points
--    applies with more force here, because this is actual money: a payment record
--    is not something a status recomputation is allowed to overwrite.
--
-- 3. WRITES NOBODY CHECKED. Both the insert and the update discard `{ error }`,
--    and supabase-js does not throw — so an RLS refusal or a constraint violation
--    produced a cheerful "you're signed up" notification and no enrollment.
--
-- The seat count and the write now happen under one lock on the session row, and
-- the payment status can only ever move forward.

create or replace function public.class_enroll(p_session uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_class    uuid;
  v_cap      int;
  v_is_paid  boolean;
  v_taken    int;
  v_existing record;
  v_status   text;
  v_payment  text;
begin
  if v_me is null or p_session is null then return 'invalid'; end if;

  -- Lock the SESSION: capacity is a property of the session, and every
  -- concurrent enroller for it must queue behind this line. Taken before the
  -- count, because the count is the thing being protected.
  perform 1 from public.class_sessions where id = p_session for update;

  select s.class_id, coalesce(s.capacity, c.capacity), c.is_paid
    into v_class, v_cap, v_is_paid
    from public.class_sessions s
    join public.classes c on c.id = s.class_id
   where s.id = p_session
     and s.status = 'scheduled'
     and c.status = 'published';

  if v_class is null then return 'unavailable'; end if;

  select * into v_existing
    from public.class_enrollments
   where session_id = p_session and user_id = v_me;

  -- Seat math under the lock. `enrolled`, `attended` and `no_show` consume a seat
  -- (lib/classes.ts takesSeat) — a no-show still occupied the place.
  select count(*) into v_taken
    from public.class_enrollments
   where session_id = p_session
     and status in ('enrolled', 'attended', 'no_show')
     and (v_existing.user_id is null or user_id <> v_me);

  v_status := case when v_cap is not null and v_taken >= v_cap then 'waitlisted' else 'enrolled' end;

  if v_existing.user_id is not null then
    -- Already active: nothing to do, and say so rather than silently returning.
    if v_existing.status <> 'cancelled' then
      return 'already_' || v_existing.status;
    end if;

    -- PAYMENT NEVER MOVES BACKWARDS. A recorded 'paid' or 'refunded' survives a
    -- re-join untouched; only a status that never represented money is recomputed.
    v_payment := case
      when v_existing.payment_status in ('paid', 'refunded') then v_existing.payment_status
      when v_is_paid then 'pending'
      else 'not_required'
    end;

    update public.class_enrollments
       set status = v_status, payment_status = v_payment, updated_at = now()
     where session_id = p_session and user_id = v_me;
    return v_status;
  end if;

  v_payment := case when v_is_paid then 'pending' else 'not_required' end;

  insert into public.class_enrollments (session_id, class_id, user_id, status, payment_status)
  values (p_session, v_class, v_me, v_status, v_payment);

  return v_status;
end $$;

revoke all on function public.class_enroll(uuid) from public, anon;
grant execute on function public.class_enroll(uuid) to authenticated, service_role;

comment on function public.class_enroll is
  'KRA-033: seat count and write under one lock on the session, so the last seat cannot be sold '
  'twice. A recorded payment (paid/refunded) is never recomputed away by a re-join.';

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.class_enrollment_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select position('for update' in pg_get_functiondef(p.oid)) > 0
        -- the lock must precede the count, or it protects nothing
        and position('for update' in pg_get_functiondef(p.oid))
            < position('select count(*) into v_taken' in pg_get_functiondef(p.oid))
        and position('''paid'', ''refunded''' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'class_enroll' limit 1)
    -- and no session is currently over its capacity
    and not exists (
      select 1
        from public.class_sessions s
        join public.classes c on c.id = s.class_id
       where coalesce(s.capacity, c.capacity) is not null
         and (
           select count(*) from public.class_enrollments e
            where e.session_id = s.id and e.status in ('enrolled', 'attended', 'no_show')
         ) > coalesce(s.capacity, c.capacity)
    );
$$;

revoke all on function public.class_enrollment_intact() from public, anon, authenticated;
grant execute on function public.class_enrollment_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 36)
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
