-- 0252_points_ledger_integrity.sql — treats points as currency: never lost,
-- always traceable, always recoverable.
--
-- OWNER DIRECTIVE (2026-08-10): "Points should be treated like banking credits or
-- credit card points… our point system must be as reliable as a bank system so
-- points are never lost and must be traceable so if any error occurs, it must be
-- recoverable. Users might get sponsorships and other benefits in the future
-- because of points, so we must treat it as important as currency."
--
-- ── WHAT WAS ALREADY RIGHT ────────────────────────────────────────────────
-- The architecture is already the correct one for this, which is worth saying
-- because it means the gap is enforcement rather than redesign:
--   · `queue_points` and `tournament_points` are EVENT LEDGERS — one row per
--     earning event, carrying why it happened (match/session, or
--     tournament/division/registration/place/field_size).
--   · `player_sports.points` is a PROJECTION — rolling best-8 over 52 weeks —
--     not a stored balance. It is a function of the ledger and can always be
--     recomputed, which is exactly the property a recoverable system needs.
--   · Both ledgers already carry idempotency keys: UNIQUE(match_id, user_id) and
--     UNIQUE(division_id, user_id). A retry cannot double-credit.
--   · 0251 serialised the recompute, closing a reproduced lost-update race.
--
-- Points are EARNED and AGE OUT; they are never spent. So there is no
-- double-spend problem, and the hard requirements are integrity of history and
-- reconstructability of the projection.
--
-- ── WHAT WAS NOT BANK-GRADE ───────────────────────────────────────────────
-- 1. THE LEDGER COULD BE DESTROYED. `tournament_points.tournament_id` and
--    `.division_id` were ON DELETE **CASCADE**. Deleting one tournament silently
--    deleted every point row earned in it, for every player. The projection would
--    then recompute to a lower number and nothing anywhere would record that
--    anything had been lost. Under a currency model this is a bank deleting
--    transaction history because a branch closed.
-- 2. THE LEDGER COULD BE REWRITTEN. No trigger prevented UPDATE of `points`,
--    `user_id` or `earned_at`. A service-role bug could change a value in place
--    leaving no evidence it had ever been different.
-- 3. THERE WAS NO WAY TO UNDO WITHOUT DESTROYING. Correcting a wrong result or
--    voiding a disqualified entry meant DELETEing the row — the one operation
--    that loses history.
-- 4. NOTHING RECONCILED. If the projection drifted from the ledger — a failed
--    recompute, a partial deploy — no check compared them, so drift was silent
--    and permanent until someone noticed a wrong number on a profile.
--
-- ── WHY VOID-FLAGS AND NOT NEGATIVE ENTRIES ──────────────────────────────
-- Double-entry systems reverse by posting a compensating amount. That is right
-- for a BALANCE and wrong here: the projection is "best 8 of the last 52 weeks",
-- so a -50 row would be ranked among the best-8 candidates and corrupt the very
-- computation it was meant to correct. Voiding marks the original row dead,
-- preserves it in full with actor and reason, and excludes it from the window.
-- History is intact, the arithmetic stays meaningful, and the audit trail is the
-- same one a reversal entry would have produced.

-- ═══ 1. reversal without destruction ═════════════════════════════════════
alter table public.queue_points
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid,
  add column if not exists void_reason text,
  -- Provenance that OUTLIVES the parent row. `match_id` is ON DELETE SET NULL, so
  -- after a cleanup the row would otherwise no longer say what it came from.
  add column if not exists source_ref  text;

alter table public.tournament_points
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid,
  add column if not exists void_reason text,
  add column if not exists source_ref  text;

comment on column public.queue_points.voided_at is
  'Set to reverse this credit WITHOUT deleting it (0252). Voided rows are excluded from the balance '
  'and retained forever with actor and reason. Deleting a points row is never the correction.';
comment on column public.queue_points.source_ref is
  'Immutable text copy of the originating match id, captured at insert. Survives the parent row being '
  'deleted, so a credit can always be traced to what caused it.';

-- ═══ 2. the destructive cascades ═════════════════════════════════════════
-- A tournament being deleted must not delete anyone's earned points. The link is
-- allowed to go null; the CREDIT is not allowed to disappear.
alter table public.tournament_points
  drop constraint if exists tournament_points_tournament_id_fkey,
  drop constraint if exists tournament_points_division_id_fkey;

alter table public.tournament_points
  add constraint tournament_points_tournament_id_fkey
    foreign key (tournament_id) references public.tournaments(id) on delete restrict,
  add constraint tournament_points_division_id_fkey
    foreign key (division_id) references public.tournament_divisions(id) on delete restrict;

-- RESTRICT rather than SET NULL, decided by running it: `tournament_id` is NOT
-- NULL, so a SET NULL cascade FAILED with a not-null violation and the delete was
-- refused anyway. The credit survived — but by accident, reported as a constraint
-- error about a column rather than as a policy.
--
-- RESTRICT makes the same outcome deliberate and legible: a tournament that has
-- awarded points cannot be deleted until those points are VOIDED, which is the
-- banking rule (an account with transactions is closed, not erased) and which
-- forces the destruction to be an explicit, attributed, reversible act instead of
-- a side effect of a cleanup script.
--
-- `user_id` CASCADE is DELIBERATELY LEFT IN PLACE. Erasure of a deleted account's
-- data is a legal obligation that outranks ledger permanence, and Klimr already
-- keeps `deleted_users_ledger` as the tombstone. That exception is the one place
-- history is allowed to end, and section 3 makes it require an explicit flag so
-- it cannot happen by accident.

-- ═══ 3. append-only ══════════════════════════════════════════════════════
create or replace function public.points_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- The ONLY permitted deletion is account erasure, and it must say so.
    if coalesce(current_setting('klimr.points_erasure', true), 'off') <> 'on' then
      raise exception 'points_ledger_append_only: % rows are never deleted — void them instead', tg_table_name
        using hint = 'Set voided_at/void_reason. Erasure sets klimr.points_erasure.';
    end if;
    return old;
  end if;

  -- UPDATE: only the void fields may change. Everything that determines the
  -- amount or the identity of a credit is frozen once written.
  if new.points is distinct from old.points
     or new.user_id is distinct from old.user_id
     or new.sport_key is distinct from old.sport_key
     or new.earned_at is distinct from old.earned_at
     or new.source_ref is distinct from old.source_ref then
    raise exception 'points_ledger_append_only: % is append-only — amount and identity cannot change', tg_table_name
      using hint = 'Void the row and write a corrected one.';
  end if;

  -- A void is permanent too: unvoiding would let history be laundered.
  if old.voided_at is not null and new.voided_at is null then
    raise exception 'points_ledger_append_only: a void cannot be reversed — write a new credit instead';
  end if;

  return new;
end $$;

create or replace function public.points_ledger_stamp_source()
returns trigger
language plpgsql
as $$
begin
  if new.source_ref is null then
    new.source_ref := coalesce(
      to_jsonb(new) ->> 'match_id',
      to_jsonb(new) ->> 'division_id',
      to_jsonb(new) ->> 'tournament_id'
    );
  end if;
  return new;
end $$;

drop trigger if exists queue_points_append_only on public.queue_points;
create trigger queue_points_append_only
  before update or delete on public.queue_points
  for each row execute function public.points_ledger_append_only();

drop trigger if exists tournament_points_append_only on public.tournament_points;
create trigger tournament_points_append_only
  before update or delete on public.tournament_points
  for each row execute function public.points_ledger_append_only();

drop trigger if exists queue_points_stamp_source on public.queue_points;
create trigger queue_points_stamp_source
  before insert on public.queue_points
  for each row execute function public.points_ledger_stamp_source();

drop trigger if exists tournament_points_stamp_source on public.tournament_points;
create trigger tournament_points_stamp_source
  before insert on public.tournament_points
  for each row execute function public.points_ledger_stamp_source();

-- Backfill provenance for rows written before this migration.
update public.queue_points set source_ref = match_id::text
 where source_ref is null and match_id is not null;
update public.tournament_points set source_ref = coalesce(division_id::text, tournament_id::text)
 where source_ref is null and (division_id is not null or tournament_id is not null);

-- ═══ 4. the canonical balance, in ONE place ══════════════════════════════
-- `recompute_player_points` is the writer; this is the definition. Having the
-- rule in one function is what lets reconciliation be meaningful — two copies of
-- "best 8 of 52 weeks" would eventually disagree and the drift check would be
-- measuring the difference between two bugs.
create or replace function public.points_balance(p_user uuid, p_sport text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(points), 0)::int
    from (
      select points from (
        select points, earned_at from public.tournament_points
         where user_id = p_user and sport_key = p_sport
           and earned_at > now() - interval '52 weeks'
           and voided_at is null
        union all
        select points, earned_at from public.queue_points
         where user_id = p_user and sport_key = p_sport
           and earned_at > now() - interval '52 weeks'
           and voided_at is null
      ) pool
      order by points desc
      limit 8
    ) best;
$$;

revoke all on function public.points_balance(uuid, text) from public, anon;
grant execute on function public.points_balance(uuid, text) to authenticated, service_role;

-- The writer now delegates, so the projection cannot diverge from the definition.
create or replace function public.recompute_player_points(p_user uuid, p_sport text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_total integer;
begin
  if p_user is null or p_sport is null then return 0; end if;

  -- KRA-038: serialise BEFORE the read. Reproduced without it: two concurrent
  -- finishers left the stored total at 50 instead of 100.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_sport, 0));

  v_total := public.points_balance(p_user, p_sport);

  perform set_config('klimr.privileged_write', 'on', true);
  insert into public.player_sports (user_id, sport_key, points, updated_at)
  values (p_user, p_sport, v_total, now())
  on conflict (user_id, sport_key)
  do update set points = excluded.points, updated_at = excluded.updated_at;

  return v_total;
end $$;

-- ═══ 5. void, with a record ══════════════════════════════════════════════
create or replace function public.void_points_entry(
  p_table  text,      -- 'queue_points' | 'tournament_points'
  p_id     uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_sport text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'void_points_entry: a reason is required';
  end if;
  if p_table not in ('queue_points', 'tournament_points') then
    raise exception 'void_points_entry: unknown ledger %', p_table;
  end if;

  execute format(
    'update public.%I set voided_at = now(), voided_by = $1, void_reason = $2
      where id = $3 and voided_at is null returning user_id, sport_key', p_table)
    into v_user, v_sport
    using auth.uid(), left(p_reason, 500), p_id;

  if v_user is null then
    return false;      -- absent or already voided; both are no-ops, not errors
  end if;

  -- The projection follows immediately, so a void is never "pending".
  perform public.recompute_player_points(v_user, v_sport);
  return true;
end $$;

revoke all on function public.void_points_entry(text, uuid, text) from public, anon, authenticated;
grant execute on function public.void_points_entry(text, uuid, text) to service_role;

-- ═══ 6. reconciliation and recovery ══════════════════════════════════════
-- The projection is derived, so the recovery procedure is "recompute from the
-- ledger". That is only a real guarantee if something CHECKS it continuously —
-- otherwise drift is silent until a member notices a wrong number.
create or replace function public.points_drift()
returns table (user_id uuid, sport_key text, stored integer, canonical integer)
language sql
stable
security definer
set search_path = public
as $$
  select ps.user_id, ps.sport_key, ps.points,
         public.points_balance(ps.user_id, ps.sport_key)
    from public.player_sports ps
   where ps.points is distinct from public.points_balance(ps.user_id, ps.sport_key);
$$;

create or replace function public.points_drift_count()
returns int
language sql
stable
security definer
set search_path = public
as $$ select count(*)::int from public.points_drift(); $$;

-- The recovery procedure, written down as code rather than as a runbook step
-- somebody has to find under pressure.
create or replace function public.rebuild_all_player_points()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_n int := 0;
begin
  for r in
    select distinct user_id, sport_key from (
      select user_id, sport_key from public.queue_points
      union
      select user_id, sport_key from public.tournament_points
      union
      select user_id, sport_key from public.player_sports
    ) s
  loop
    perform public.recompute_player_points(r.user_id, r.sport_key);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.points_drift() from public, anon, authenticated;
revoke all on function public.points_drift_count() from public, anon, authenticated;
revoke all on function public.rebuild_all_player_points() from public, anon, authenticated;
grant execute on function public.points_drift() to service_role;
grant execute on function public.points_drift_count() to service_role;
grant execute on function public.rebuild_all_player_points() to service_role;

comment on function public.rebuild_all_player_points is
  'Recovery procedure: rebuilds every projection from the ledger. Safe to run at any time — the '
  'ledger is the source of truth and this is a pure function of it.';

-- 0251's `expiry_and_points_intact` pinned the literal string
-- `select coalesce(sum(points)` inside `recompute_player_points`. Section 4 above
-- replaced that read with a call to `points_balance()`, so the assertion broke —
-- correctly noticing the shape changed, and wrongly reporting a regression when
-- the PROPERTY (lock taken before the read) still holds.
--
-- The lesson is the one this remediation keeps relearning: a check pinned to an
-- implementation detail fails on a refactor and passes on a rewrite that breaks
-- the invariant. Redefined against the property — the lock must precede whatever
-- reads the ledger, whatever that read is called today.
create or replace function public.expiry_and_points_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select position('activated_at' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'end_stale_court_sessions' limit 1)
    and (select position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'recompute_player_points' limit 1)
    -- the lock precedes the balance read, which is the whole invariant
    and (select position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid))
              < position('points_balance(' in pg_get_functiondef(p.oid))
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'recompute_player_points' limit 1);
$$;

revoke all on function public.expiry_and_points_intact() from public, anon, authenticated;
grant execute on function public.expiry_and_points_intact() to service_role;

-- ═══ 7. boundary sentinel ════════════════════════════════════════════════
create or replace function public.points_ledger_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no cascade may destroy a credit
    not exists (
      select 1 from pg_constraint
       where contype = 'f' and confdeltype = 'c'
         and conrelid in ('public.queue_points'::regclass, 'public.tournament_points'::regclass)
         and conname not like '%user_id%'          -- erasure is the documented exception
    )
    -- both ledgers are append-only
    and (select count(*) from pg_trigger
          where tgname in ('queue_points_append_only', 'tournament_points_append_only')) = 2
    -- and the projection agrees with the ledger, everywhere
    and public.points_drift_count() = 0;
$$;

revoke all on function public.points_ledger_intact() from public, anon, authenticated;
grant execute on function public.points_ledger_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 32)
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
