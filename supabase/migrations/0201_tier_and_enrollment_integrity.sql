-- 0201_tier_and_enrollment_integrity.sql — KCDX-009 and KCDX-013 (P1).
-- Two findings, one shape: a member writing the row that is supposed to record
-- someone else's judgement about them.
--
-- ── KCDX-009: business verification tier ─────────────────────────────────
-- `guard_business_protected` pins `verification_level` and `status` for anyone
-- who is not `service_role` — and it is a BEFORE **UPDATE** trigger. The INSERT
-- policy checks `owner_id = auth.uid() and status = 'draft'` and says nothing
-- about the tier, so a member can create a business with
-- `verification_level: 'tier2'` in the first place. The guard then faithfully
-- protects that value from ever changing, and an admin activating the business
-- later sets `status` without touching a tier nobody granted.
--
-- The gap is not that the guard is wrong; it is that it defends the second step
-- of a two-step process and the first step was unguarded. Firing it on INSERT is
-- the whole fix.
--
-- ── KCDX-013: class enrollment ───────────────────────────────────────────
-- `class_enrollments_update` lets `user_id = auth.uid()` update the whole row.
-- The row holds `payment_status` and a `status` whose values include `attended`
-- and `no_show`. So a learner can mark themselves paid and present. Those are
-- the provider's observations, not the learner's claims.
--
-- There is also no structural link between `session_id` and `class_id`: they are
-- two independent foreign keys, so an enrollment can name a session from one
-- class and a class from another, and every read that trusts `class_id` — the
-- provider's roster, the fee calculation — is then reading about the wrong class.
--
-- Column-level grants cannot separate learner from provider here, because both
-- are the `authenticated` role and the difference is per-row. So the writes
-- become commands, each deriving its own authority.

-- ── 1. the business guard covers creation, not just change ────────────────
create or replace function public.guard_business_protected()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'service_role' then
    if tg_op = 'INSERT' then
      -- A tier is something review grants. It is not an input.
      new.verification_level := 'none';
      new.status := 'draft';
    else
      new.verification_level := old.verification_level;
      new.status := old.status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists business_accounts_guard on public.business_accounts;
create trigger business_accounts_guard
  before insert or update on public.business_accounts
  for each row execute function public.guard_business_protected();

-- Anything already sitting on an unearned tier goes back to none. Nothing is
-- deleted; a business that genuinely earned tier2 through review is re-granted by
-- the same review, and one that asserted it never should have had it.
update public.business_accounts b
   set verification_level = 'none'
 where b.verification_level <> 'none'
   and not exists (
     select 1 from public.business_tier_applications a
      where a.business_id = b.id and a.status = 'approved'
   );

-- ── 1b. a live bug found while testing the above ─────────────────────────
-- `businesses readable` subqueries `business_members`, whose own read policy
-- subqueries `business_accounts`. Postgres detects the loop and raises 42P17
-- "infinite recursion detected in policy". The INSERT succeeds; the RETURNING
-- clause is what trips it — and `app/business/actions.ts` does
-- `.insert(...).select("id")`, then `if (!inserted) return;`. So creating a
-- business does nothing at all today: no row visible to the caller, no error
-- shown, no redirect. Silent.
--
-- `is_business_manager()` already exists as SECURITY DEFINER for exactly this
-- reason; the policy simply was not using it. A definer function reads
-- `business_members` with its own rights, so the cycle never forms.
-- There is a SECOND defect underneath the recursion, and it only became visible
-- once the recursion was gone. `INSERT ... RETURNING` requires the returned row
-- to satisfy the SELECT policy too. Ownership is recorded by
-- `business_accounts_auto_owner`, an AFTER INSERT trigger, so at the moment
-- RETURNING is evaluated there is no `business_members` row yet — and the new
-- business is `published=false, status='draft'`, which fails the public arm.
-- The creator therefore could not see the business they had just created.
--
-- So business creation has never worked end to end: first it raised 42P17, and
-- with that fixed it would have returned no row. Both failures are silent,
-- because the action does `if (!inserted) return;`. `owner_id = auth.uid()` is
-- the missing arm — an owner can see their own business without waiting for a
-- membership row to exist.
create policy "businesses readable v2" on public.business_accounts
  for select to authenticated using (
    (published = true and status = 'active')
    or owner_id = auth.uid()
    or public.is_business_manager(id, auth.uid())
  );
drop policy if exists "businesses readable" on public.business_accounts;
alter policy "businesses readable v2" on public.business_accounts rename to "businesses readable";

-- ── 2. an enrollment's session and class must be the same class ───────────
alter table public.class_sessions
  drop constraint if exists class_sessions_id_class_key;
alter table public.class_sessions
  add constraint class_sessions_id_class_key unique (id, class_id);

-- Repair before constraining: an enrollment whose class_id disagrees with its
-- session is corrected to the session's class, because the session is the thing
-- that actually happened.
update public.class_enrollments e
   set class_id = s.class_id
  from public.class_sessions s
 where s.id = e.session_id and e.class_id <> s.class_id;

alter table public.class_enrollments
  drop constraint if exists class_enrollments_session_class_fk;
alter table public.class_enrollments
  add constraint class_enrollments_session_class_fk
  foreign key (session_id, class_id)
  references public.class_sessions (id, class_id)
  on delete cascade;

-- ── 3. learners stop writing the provider's observations ──────────────────
drop policy if exists class_enrollments_update on public.class_enrollments;

-- The provider may still edit the roster directly — it is their class, and every
-- column on the row is theirs to record.
create policy class_enrollments_provider_update on public.class_enrollments
  for update to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()));

-- A learner enrolling must not choose their own status or payment state either;
-- the INSERT policy only checks identity, so the values are pinned here.
create or replace function public.guard_enrollment_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_provider uuid;
begin
  select c.provider_id into v_provider from public.classes c where c.id = new.class_id;
  if current_user <> 'service_role' and auth.uid() is distinct from v_provider then
    new.status         := 'enrolled';
    new.payment_status := 'not_required';
    new.confirmed_at   := null;
  end if;
  return new;
end;
$$;

drop trigger if exists class_enrollments_guard_insert on public.class_enrollments;
create trigger class_enrollments_guard_insert
  before insert on public.class_enrollments
  for each row execute function public.guard_enrollment_insert();

-- ── 4. the one thing a learner legitimately decides ───────────────────────
-- Whether they are coming. Everything else about the row is an observation.
create or replace function public.class_set_confirmation(
  p_enrollment uuid,
  p_confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_e record;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_e from public.class_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_e.user_id <> v_me then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if v_e.status in ('cancelled','attended','no_show') then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;
  update public.class_enrollments
     set confirmed_at = case when p_confirmed then now() end, updated_at = now()
   where id = p_enrollment;
  return jsonb_build_object('ok', true, 'confirmed', p_confirmed);
end;
$$;

/** A learner withdrawing. Distinct from the provider marking a no-show, which is
 *  a judgement and stays with the provider. */
create or replace function public.class_cancel_enrollment(p_enrollment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_e record; v_provider uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_e from public.class_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select c.provider_id into v_provider from public.classes c where c.id = v_e.class_id;
  if v_e.user_id <> v_me and v_provider is distinct from v_me then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_e.status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'cancelled'); end if;
  update public.class_enrollments set status = 'cancelled', updated_at = now() where id = p_enrollment;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.class_set_confirmation(uuid, boolean) from public, anon;
revoke all on function public.class_cancel_enrollment(uuid) from public, anon;
grant execute on function public.class_set_confirmation(uuid, boolean) to authenticated, service_role;
grant execute on function public.class_cancel_enrollment(uuid) to authenticated, service_role;

-- ── 5. keep it closed ─────────────────────────────────────────────────────
create or replace function public.enrollment_boundary_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no learner-authored UPDATE policy on enrollments
    not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'class_enrollments'
         and cmd = 'UPDATE' and policyname <> 'class_enrollments_provider_update'
    )
    -- the session/class binding is structural, not conventional
    and exists (
      select 1 from pg_constraint
       where conname = 'class_enrollments_session_class_fk' and contype = 'f'
    )
    -- the business guard covers creation
    and exists (
      select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'business_accounts' and t.tgname = 'business_accounts_guard'
         and (t.tgtype::int & 4) > 0   -- fires on INSERT
    );
$$;

revoke all on function public.enrollment_boundary_intact() from public, anon, authenticated;
grant execute on function public.enrollment_boundary_intact() to service_role;
