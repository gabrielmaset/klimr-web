-- 0246_privileged_outcome_issued.sql — adds an honest state for "a privileged
-- client was handed out and we do not know what happened next".
--
-- KRA-017 (P1, re-audit 2026-08-10). 0197 gave `admin_actions` an `outcome` of
-- 'started' | 'ok' | 'error' so the audit could answer "which privileged
-- operations started and never finished". `withPrivileged()` uses that pair
-- correctly. But `getPrivilegedClient()` — which is what 88 files actually call —
-- writes **'ok' at the moment it hands out the client**, before the operation it
-- is auditing has run. Every one of those rows asserts a success nobody observed.
--
-- Why not just write 'started' instead: because then every ordinary client handout
-- would produce an unpaired 'started', and the incident query ("started with no
-- partner") — the entire reason 0197 exists — would drown in them. The two states
-- are genuinely different and collapsing them destroys the signal:
--
--   'started' → an operation is in flight and a matching row is EXPECTED.
--               An unpaired one is an incident.
--   'issued'  → a client was created. Nothing is promised about the outcome, and
--               no partner row will arrive. Not an incident; not a success either.
--
-- The point is that the audit stops making a claim it cannot support. Narrowing
-- the 88 raw callers to transactionally-audited domain commands is the real fix
-- and is per-domain work — 0193's tournament commands are the pattern. This
-- migration does not pretend otherwise.

alter table public.admin_actions
  drop constraint if exists admin_actions_outcome_check;

alter table public.admin_actions
  add constraint admin_actions_outcome_check
  check (outcome is null or outcome in ('started', 'ok', 'error', 'issued'));

-- The incident query must not count 'issued' rows, or it reports thousands of
-- incidents a day and gets muted — and muting it takes the real alarm with it.
create or replace function public.privileged_started_unfinished(p_older_minutes int default 15)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.admin_actions a
   where a.outcome = 'started'
     and a.created_at < now() - make_interval(mins => greatest(coalesce(p_older_minutes, 15), 1))
     and not exists (
       select 1 from public.admin_actions b
        where b.command_id = a.command_id
          and b.outcome in ('ok', 'error')
     );
$$;

revoke all on function public.privileged_started_unfinished(int) from public, anon, authenticated;
grant execute on function public.privileged_started_unfinished(int) to service_role;

comment on function public.privileged_started_unfinished is
  'KRA-017: privileged operations that began and never reported an end. Counts ONLY ''started'' — an '
  '''issued'' row promises nothing and pairs with nothing, so including it would bury this number in '
  'routine noise.';

create or replace function public.privileged_audit_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the honest state exists
    (select position('issued' in pg_get_constraintdef(c.oid)) > 0
       from pg_constraint c
      where c.conname = 'admin_actions_outcome_check' limit 1)
    -- and no row claims success without a matching start
    and not exists (
      select 1 from public.admin_actions a
       where a.outcome = 'ok'
         and a.command_id is not null
         and not exists (
           select 1 from public.admin_actions b
            where b.command_id = a.command_id and b.outcome = 'started'
         )
    );
$$;

revoke all on function public.privileged_audit_intact() from public, anon, authenticated;
grant execute on function public.privileged_audit_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 26)
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
