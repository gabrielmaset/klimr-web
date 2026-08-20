-- 0288_admission_grace.sql — INCIDENT FIX for 0283. Restores member writes for
-- accounts that existed before the admission gate, on an explicit, dated,
-- per-row pre-admission path.
--
-- WHAT HAPPENED. 0283 made an attested adult birth date a precondition for every
-- member write. On this production database 254 of 256 active profiles have no
-- stored birth date, so the gate blocked essentially the entire user base from
-- posting, joining or creating anything the moment it was pasted. The migration
-- printed that count as a NOTICE — which the Supabase SQL editor does not
-- display — so the blast radius was invisible at paste time. The measurement
-- should have been taken BEFORE the gate shipped, not reported by it afterwards.
--
-- WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
--   It does NOT backfill attestation for those 254 accounts. Attesting people
--   whose age nobody asserted would be inventing the exact fact the gate exists
--   to establish, and would leave a record claiming they attested when they did
--   not. KFU-033 asked for an explicit pre-admission path for existing rows —
--   this is that path, not a silent grandfather.
--
--   Each pre-existing account receives a DATED grace window recorded on its own
--   row. During the window the account can use Klimr normally while being asked
--   to complete onboarding. After it expires the account needs the same adult
--   attestation as everyone else. New accounts get no grace: they must attest
--   at onboarding, which is what 0283 was for.
--
--   The window is visible in the data (a column anyone can query), dated, and
--   expires by itself. That is the difference between a grace period and a hole.

alter table public.profiles
  add column if not exists admission_grace_until timestamptz;

comment on column public.profiles.admission_grace_until is
  'KFU-033 pre-admission path (0288): accounts that predate the admission gate may write until this '
  'moment while they are prompted to complete onboarding. Null for every account created after the '
  'gate — those attest at onboarding. Set once by 0288 and never extended automatically.';

-- Grant the window to accounts that (a) exist now, (b) are not attested, and
-- (c) are active. 30 days from this migration.
do $$
declare
  v_granted int;
begin
  update public.profiles
     set admission_grace_until = now() + interval '30 days'
   where adult_attested_at is null
     and admission_grace_until is null
     and account_status = 'active';
  get diagnostics v_granted = row_count;
  raise notice '0288: granted a 30-day pre-admission window to % existing account(s)', v_granted;
end $$;

-- Eligibility: attested, OR inside an unexpired pre-admission window.
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
       and (
         p.adult_attested_at is not null
         or (p.admission_grace_until is not null and p.admission_grace_until > now())
       )
       from public.profiles p
      where p.id = p_user),
    false            -- fail closed: no row, no permission
  );
$$;

comment on function public.member_write_allowed is
  'KFU-028 + KFU-033: may this member write right now — active, not suspended, and EITHER adult-attested '
  'OR inside the dated pre-admission window granted by 0288 to accounts that predate the gate. '
  'Fail-closed. One definition, enforced by enforce_active_member across the member-write surface.';

-- The refusal message now distinguishes "you never attested" from "your window
-- closed", because those need different words from the product.
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
  v_grace timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return coalesce(new, old);
  end if;
  if public.member_write_allowed(v_uid) then
    return coalesce(new, old);
  end if;
  v_status   := (select p.account_status from public.profiles p where p.id = v_uid);
  v_attested := (select p.adult_attested_at from public.profiles p where p.id = v_uid);
  v_grace    := (select p.admission_grace_until from public.profiles p where p.id = v_uid);
  if v_status = 'active' and v_attested is null then
    if v_grace is not null and v_grace <= now() then
      raise exception 'admission_required'
        using errcode = 'P0001',
              hint = 'Your setup window has closed. Add your date of birth to continue using Klimr.';
    end if;
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

-- Operator visibility: how many accounts are on the clock, and until when.
create or replace function public.admission_status_summary()
returns table (state text, accounts bigint, earliest_deadline timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 'attested', count(*), null::timestamptz
    from public.profiles where adult_attested_at is not null
  union all
  select 'in pre-admission window', count(*), min(admission_grace_until)
    from public.profiles
   where adult_attested_at is null and admission_grace_until > now() and account_status = 'active'
  union all
  select 'BLOCKED (window closed, not attested)', count(*), null::timestamptz
    from public.profiles
   where adult_attested_at is null and account_status = 'active'
     and (admission_grace_until is null or admission_grace_until <= now());
$$;

revoke all on function public.admission_status_summary() from public, anon, authenticated;
grant execute on function public.admission_status_summary() to service_role;

insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('public.admission_status_summary()', 'trigger_service', 'service_role', false,
   'Operator report: how many accounts are attested, on the clock, or blocked.')
on conflict (signature) do update set class = excluded.class, note = excluded.note;

select public.journal_migration('0288', '0288_admission_grace.sql', null,
  'Incident fix for 0283: existing accounts receive a dated per row pre admission window instead of being blocked outright, attestation is never invented on their behalf, new accounts still attest at onboarding, and an operator summary reports who is attested, on the clock or blocked.');
