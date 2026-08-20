-- 0283_adult_admission_state.sql — B4 / KFU-033: admission, not just rejection.
--
-- FINDING (audit, accepted). 0271 is a valid REJECT-KNOWN-MINOR belt: a stored
-- birth date that proves someone is under 18 is refused. What it is not — and
-- was never documented as — is an ADMISSION gate: a profile with NO birth date
-- at all passes, and the signup trigger creates a profile before onboarding
-- runs. A direct data-plane client can therefore hold an active member profile
-- that never met the 18+ check the product claims (D-38).
--
-- DESIGN (per the reconciliation: share KFU-028's machinery, keep separate
-- closure). A server-set admission fact rather than coupling every policy to a
-- raw birth date:
--
--   profiles.adult_attested_at   set when — and only when — an adult birth date
--                                is written. Members cannot set it directly; the
--                                guard reverts a hand-set value before anything
--                                else runs, so it cannot be forged from the data
--                                plane.
--   member_write_allowed()       H3's canonical eligibility helper now means
--                                "active AND admitted". One predicate, one
--                                definition, already wired to the 30-table
--                                enforce_active_member trigger from 0279 — so
--                                admission is enforced everywhere suspension is,
--                                with no second mechanism to drift.
--   attest_adult(p_dob)          the validated command the onboarding path can
--                                call explicitly.
--
-- HONEST NAMING: this is SELF-ATTESTATION. It proves a person asserted an adult
-- birth date through a validated path; it is not identity verification. The
-- stepped-up verified-identity work remains a separate, later programme.
--
-- EXISTING ROWS: profiles that already carry an adult birth date are attested by
-- the backfill (they passed the onboarding check under the old rule). Profiles
-- with NO birth date are deliberately left unattested and CANNOT make member
-- writes until they complete onboarding — the migration prints how many there
-- are, so the number is seen rather than discovered later.

alter table public.profiles
  add column if not exists adult_attested_at timestamptz;

comment on column public.profiles.adult_attested_at is
  'KFU-033: when this member attested an adult birth date through a validated path. Server-set only '
  '(members cannot write it); required for member writes via member_write_allowed. Self-attestation, '
  'NOT identity verification.';

-- ── the adult trigger now also grants (and protects) the admission fact ─────
create or replace function public.profiles_enforce_adult()
returns trigger
language plpgsql
as $$
begin
  -- 1. The admission fact is not member-settable. Revert a hand-set value before
  --    any other rule runs, so a direct write cannot forge admission. Trigger and
  --    service paths (current_user is not a client role) are unaffected.
  if tg_op = 'UPDATE'
     and new.adult_attested_at is distinct from old.adult_attested_at
     and current_user in ('authenticated', 'anon') then
    new.adult_attested_at := old.adult_attested_at;
  elsif tg_op = 'INSERT'
     and new.adult_attested_at is not null
     and current_user in ('authenticated', 'anon') then
    new.adult_attested_at := null;
  end if;

  -- 2. Reject a known minor (0271's rule, unchanged).
  if new.date_of_birth is not null
     and new.date_of_birth > (current_date - interval '18 years') then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;
  if new.birth_year is not null
     and new.birth_year > extract(year from current_date)::int - 18 then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;

  -- 3. Writing an adult birth date through any legitimate path IS the
  --    attestation — that is what self-attestation means, and rule 2 guarantees
  --    any stored date is adult. A null birth date earns nothing.
  if new.date_of_birth is not null and new.adult_attested_at is null then
    new.adult_attested_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_enforce_adult() from public, anon, authenticated;

drop trigger if exists profiles_enforce_adult on public.profiles;
create trigger profiles_enforce_adult
  before insert or update on public.profiles
  for each row execute function public.profiles_enforce_adult();

-- ── the explicit command for the onboarding path ────────────────────────────
create or replace function public.attest_adult(p_dob date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  if p_dob is null then
    raise exception 'date_of_birth_required' using errcode = 'P0001';
  end if;
  if p_dob > (current_date - interval '18 years') then
    raise exception 'must_be_18' using errcode = 'P0001';
  end if;
  update public.profiles
     set date_of_birth = p_dob,
         adult_attested_at = coalesce(adult_attested_at, now())
   where id = v_uid;
end;
$$;

revoke all on function public.attest_adult(date) from public, anon;
grant execute on function public.attest_adult(date) to authenticated, service_role;

comment on function public.attest_adult is
  'KFU-033: records an adult birth date and the admission fact for the CURRENT member. Refuses a '
  'minor or missing date. Self-attestation, not identity verification.';

-- ── eligibility now means active AND admitted (shared with KFU-028) ─────────
create or replace function public.member_write_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.account_status = 'active'
       and (p.suspended_until is null or p.suspended_until <= now())
       and p.adult_attested_at is not null
       from public.profiles p
      where p.id = p_user),
    false            -- fail closed: no row, no permission
  );
$$;

comment on function public.member_write_allowed is
  'KFU-028 + KFU-033: may this member write right now — active, not suspended, and admitted (adult '
  'attested). Fail-closed. One definition, enforced by the enforce_active_member trigger across the '
  'member-write surface.';

-- ── the trigger distinguishes the two refusals ──────────────────────────────
create or replace function public.enforce_active_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_status text;
  v_attested timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return coalesce(new, old);
  end if;
  if public.member_write_allowed(v_uid) then
    return coalesce(new, old);
  end if;
  v_status := (select p.account_status from public.profiles p where p.id = v_uid);
  v_attested := (select p.adult_attested_at from public.profiles p where p.id = v_uid);
  if v_status is not null and v_status = 'active' and v_attested is null then
    raise exception 'admission_required'
      using errcode = 'P0001',
            hint = 'Finish setting up your account (date of birth) before posting or joining.';
  end if;
  raise exception 'account_not_active'
    using errcode = 'P0001',
          hint = 'This account is suspended or banned and cannot make changes.';
end;
$$;

revoke all on function public.enforce_active_member() from public, anon, authenticated;

-- ── backfill + inventory (seen, not discovered later) ───────────────────────
do $$
declare
  v_attested int;
  v_pending  int;
begin
  update public.profiles
     set adult_attested_at = coalesce(adult_attested_at, now())
   where date_of_birth is not null and adult_attested_at is null;
  get diagnostics v_attested = row_count;

  v_pending := (
    select count(*) from public.profiles
     where adult_attested_at is null and account_status = 'active'
  );
  raise notice '0283: attested % existing profile(s) from a stored adult birth date', v_attested;
  raise notice '0283: % active profile(s) remain UNATTESTED and cannot make member writes until they complete onboarding', v_pending;
end $$;

select public.journal_migration('0283', '0283_adult_admission_state.sql', null,
  'KFU-033: a server set adult_attested_at admission fact that members cannot forge, granted when an adult birth date is written and required by the shared member_write_allowed eligibility helper, so a null age profile can no longer make member writes. Self attestation, not identity verification.');
