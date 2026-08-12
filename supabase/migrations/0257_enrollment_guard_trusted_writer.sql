-- 0257_enrollment_guard_trusted_writer.sql — lets the locked enrollment command
-- set the seat decision, without reopening the hole 0201 closed.
--
-- KRA-033, second half. 0256 added `class_enroll`, which computes `waitlisted` vs
-- `enrolled` under a lock on the session. Its own acceptance test showed two
-- callers seated against a capacity of one, and a single call storing
-- `not_required` for a paid class.
--
-- ── WHAT WAS ACTUALLY HAPPENING ──────────────────────────────────────────
-- 0201 added `guard_enrollment_insert`, a BEFORE INSERT trigger that pins
-- `status := 'enrolled'` and `payment_status := 'not_required'` unless the caller
-- is the provider or `service_role`. That is a correct and important control: the
-- INSERT policy only checks identity, so without it a learner could POST
-- themselves in as `attended`/`paid`.
--
-- `class_enroll` is SECURITY DEFINER, so inside it `current_user` is the function
-- owner (`postgres`) and `auth.uid()` is the LEARNER. The guard therefore fires
-- and overwrites both values it just computed. Every enrollment came out
-- `enrolled/not_required` no matter what the command decided — which is why the
-- race "failed": the seat maths was correct and the waitlist verdict was
-- discarded a moment later.
--
-- So neither control was wrong. Two correct controls disagreed because each was
-- written without the other in view, and the newer one lost silently. That is the
-- same shape as the block predicate reimplemented five times, arriving from the
-- opposite direction: not a rule copied and drifted, but two rules colliding at
-- the same row.
--
-- ── THE FIX, AND WHY NOT THE OBVIOUS ONE ────────────────────────────────
-- The obvious fix is to exempt SECURITY DEFINER callers by checking
-- `current_user = 'postgres'`. That would exempt EVERY definer function, present
-- and future, including ones written later by someone unaware of this trigger —
-- it converts a targeted control into a blanket one.
--
-- Instead the command announces itself with a transaction-local flag, the same
-- mechanism 0252 uses for `klimr.points_erasure` and the codebase uses for
-- `klimr.privileged_write`. `set_config(..., true)` makes it transaction-scoped,
-- so it cannot leak to another statement, and a learner calling PostgREST
-- directly has no way to set it. The guard's protection against the untrusted
-- path is unchanged.
create or replace function public.guard_enrollment_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_provider uuid;
begin
  -- A trusted command that has already made the decision under a lock. Only
  -- SECURITY DEFINER code can set this, and only for its own transaction.
  if coalesce(current_setting('klimr.enrollment_command', true), 'off') = 'on' then
    return new;
  end if;

  select c.provider_id into v_provider from public.classes c where c.id = new.class_id;
  if current_user <> 'service_role' and auth.uid() is distinct from v_provider then
    new.status         := 'enrolled';
    new.payment_status := 'not_required';
    new.confirmed_at   := null;
  end if;
  return new;
end;
$$;

-- The same collision exists on UPDATE for the re-join path: 0201's provider-only
-- update policy means the command's own UPDATE would be refused for a learner
-- rejoining. `class_enroll` is definer so it bypasses RLS, but the flag is set
-- for both branches so the intent is explicit rather than incidental.
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

  -- Lock the SESSION before counting: capacity is a property of the session, and
  -- the count is the thing being protected.
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

  -- `enrolled`, `attended` and `no_show` consume a seat (lib/classes.ts
  -- takesSeat) — a no-show still occupied the place.
  select count(*) into v_taken
    from public.class_enrollments
   where session_id = p_session
     and status in ('enrolled', 'attended', 'no_show')
     and (v_existing.user_id is null or user_id <> v_me);

  v_status := case when v_cap is not null and v_taken >= v_cap then 'waitlisted' else 'enrolled' end;

  -- Transaction-scoped: announces that this write is the trusted command.
  perform set_config('klimr.enrollment_command', 'on', true);

  if v_existing.user_id is not null then
    if v_existing.status <> 'cancelled' then
      return 'already_' || v_existing.status;
    end if;

    -- A recorded payment never moves backwards. `paid` and `refunded` survive a
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

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.enrollment_guard_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the guard still pins values for the untrusted path
    (select position('new.payment_status := ''not_required''' in pg_get_functiondef(p.oid)) > 0
        and position('klimr.enrollment_command' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'guard_enrollment_insert' limit 1)
    -- the exemption is a targeted flag, NOT a blanket definer bypass
    and (select position('current_user = ''postgres''' in pg_get_functiondef(p.oid)) = 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'guard_enrollment_insert' limit 1)
    -- and the command sets the flag transaction-locally (third arg true)
    and (select position('set_config(''klimr.enrollment_command'', ''on'', true)' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'class_enroll' limit 1);
$$;

revoke all on function public.enrollment_guard_intact() from public, anon, authenticated;
grant execute on function public.enrollment_guard_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 37)
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
