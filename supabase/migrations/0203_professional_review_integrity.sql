-- 0203_professional_review_integrity.sql — KCDX-011 (P1): professional
-- verification approval races applicant-controlled state.
--
-- THE ATTACK, concretely. `provider_applications_update_self` gives the applicant
-- whole-row UPDATE with only `user_id = auth.uid()` pinned, so `role`,
-- `credential_type`, `credential_id`, `credential_jurisdiction` and
-- `verification_url` stay editable after submission — including while an admin
-- has the review page open. `reviewProviderApplication` then re-reads the row at
-- approval time and grants whatever it now says, with no comparison against what
-- was reviewed.
--
-- So: submit as a coach with your own real credential, wait for an admin to open
-- the queue, change `role` to a clinical one and `credential_id` to a licence
-- number you found in a public registry, and the approval grants the row as it
-- stands. The admin's judgement was applied to a document that no longer exists.
--
-- WHY THIS ONE MATTERS MORE THAN ITS SEVERITY SUGGESTS. A verified professional
-- badge on Klimr is a claim made to other members about someone's competence to
-- handle their body and their injuries. The roles at stake include physio and
-- athletic training. An approval that can be swapped after review is not a data
-- integrity bug; it is the badge meaning nothing.
--
-- THE FIX has two halves, and both are needed:
--
--   1. FREEZE ON SUBMIT. A pending application is not a draft. Its reviewable
--      fields become immutable to the applicant; changing your mind means
--      withdrawing and submitting again, which produces a new version with a new
--      hash. This is the "separate drafts from append-only decisions" the audit
--      asks for, done with the grain of the existing table.
--
--   2. APPROVE A HASH, NOT A ROW. The reviewer's decision names the exact content
--      it was made about. If the row has moved at all, the approval fails rather
--      than applying to something else. That closes the window the freeze cannot:
--      a service-role write, an admin script, a future policy change.

-- ── 0. one answer to "is this write privileged?" ─────────────────────────
-- Fifteen places in this schema ask `current_user <> 'service_role'` to decide
-- whether a write is trusted. That test is wrong inside a SECURITY DEFINER
-- function, where `current_user` is the DEFINER — postgres — not the caller's
-- role. Today alone it silently defeated three of our own writers:
--
--   · 0194  `guard_moderation_update` undid the media re-moderation
--   · 0200  `guard_player_stats` discarded every ranking recompute
--   · 0203  `freeze_submitted_application` reverted the approval below
--
-- Each failure looked like success: the function ran, returned the right value,
-- and wrote nothing. Only a test that read the STORED row caught any of them.
--
-- So the question gets one implementation. A guard asks this; a definer function
-- that is entitled to write declares itself for the duration of its transaction.
-- The flag is transaction-local (`set_config(..., true)`), so it cannot leak into
-- another statement, and it is greppable, which a role comparison scattered
-- across fifteen functions is not.
create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
as $$
  select current_user = 'service_role'
      or coalesce(current_setting('klimr.privileged_write', true), '') = 'on';
$$;

grant execute on function public.is_privileged_writer() to authenticated, service_role;

comment on function public.is_privileged_writer is
  'KCDX-011: the single test guards use. current_user is the DEFINER inside a SECURITY DEFINER '
  'function, so a bare role comparison silently discards our own privileged writes.';

alter table public.provider_applications
  add column if not exists content_hash text,
  add column if not exists submitted_at timestamptz,
  add column if not exists version      integer not null default 1;

-- ── the content of a decision ─────────────────────────────────────────────
-- Everything a reviewer looks at when deciding. Deliberately NOT `updated_at` or
-- `review_note`: the hash must be stable across the reviewer's own annotations.
create or replace function public.provider_application_hash(p_app public.provider_applications)
returns text
language sql
immutable
as $$
  -- Built-in sha256(bytea), not pgcrypto's digest(): no extension dependency, so
  -- this works identically in the CI replay harness and on Supabase.
  select encode(sha256(convert_to(
    coalesce(p_app.user_id::text, '') || '|' ||
    coalesce(p_app.role, '') || '|' ||
    coalesce(p_app.headline, '') || '|' ||
    coalesce(p_app.bio, '') || '|' ||
    coalesce(p_app.credential_type, '') || '|' ||
    coalesce(p_app.credential_id, '') || '|' ||
    coalesce(p_app.credential_jurisdiction, '') || '|' ||
    coalesce(p_app.verification_url, '') || '|' ||
    coalesce(p_app.applicant_note, '') || '|' ||
    coalesce(p_app.version::text, '1'),
    'UTF8')), 'hex');
$$;

-- ── 1. a pending application is not a draft ───────────────────────────────
create or replace function public.freeze_submitted_application()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at := coalesce(new.submitted_at, now());
    new.content_hash := public.provider_application_hash(new);
    return new;
  end if;

  -- The applicant may withdraw a pending application. That is the escape hatch,
  -- and it is the honest one: withdrawing is visible, editing under review is not.
  if not public.is_privileged_writer()
     and old.status = 'pending'
     and new.status = 'withdrawn'
     and new.role is not distinct from old.role
     and new.credential_id is not distinct from old.credential_id then
    return new;
  end if;

  -- Otherwise the reviewable content of a submitted application is fixed.
  if not public.is_privileged_writer() and old.status in ('pending','approved','rejected') then
    new.role                    := old.role;
    new.headline                := old.headline;
    new.bio                     := old.bio;
    new.credential_type         := old.credential_type;
    new.credential_id           := old.credential_id;
    new.credential_jurisdiction := old.credential_jurisdiction;
    new.verification_url        := old.verification_url;
    new.applicant_note          := old.applicant_note;
    new.status                  := old.status;
    new.version                 := old.version;
  end if;

  new.content_hash := public.provider_application_hash(new);
  return new;
end;
$$;

drop trigger if exists provider_applications_freeze on public.provider_applications;
create trigger provider_applications_freeze
  before insert or update on public.provider_applications
  for each row execute function public.freeze_submitted_application();

-- Backfill so every existing row has the hash its reviewer would be shown.
update public.provider_applications
   set content_hash = public.provider_application_hash(provider_applications),
       submitted_at = coalesce(submitted_at, created_at)
 where content_hash is null;

-- ── 2. approve the version that was reviewed, or nothing ──────────────────
create or replace function public.provider_review_decide(
  p_app           uuid,
  p_decision      text,          -- 'approved' | 'rejected'
  p_expected_hash text,
  p_reviewer      uuid,
  p_note          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
-- %rowtype, not `record`: a plpgsql `record` cannot be passed to a function that
-- takes the table's composite type ("cannot cast type record to
-- provider_applications"), which is a compile-time-looking error that only shows
-- up when the branch actually runs.
declare v_app public.provider_applications%rowtype; v_now text;
begin
  if p_decision not in ('approved','rejected') then
    return jsonb_build_object('ok', false, 'error', 'bad_decision');
  end if;

  -- This function IS the entitled writer for these rows; say so, for this
  -- transaction only.
  perform set_config('klimr.privileged_write', 'on', true);

  select * into v_app from public.provider_applications where id = p_app for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_app.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_app.status);
  end if;

  -- The decision names its content. If the application moved between the review
  -- page rendering and this call, the approval does not silently transfer to the
  -- new contents — it fails, and the reviewer looks again.
  v_now := public.provider_application_hash(v_app);
  if p_expected_hash is null or p_expected_hash <> v_now then
    return jsonb_build_object(
      'ok', false, 'error', 'changed_since_review',
      'reviewed_hash', p_expected_hash, 'current_hash', v_now);
  end if;

  update public.provider_applications
     set status      = p_decision,
         review_note = p_note,
         reviewed_by = p_reviewer,
         reviewed_at = now(),
         updated_at  = now()
   where id = p_app;

  -- Returned so the caller grants the role that was REVIEWED, not one it re-reads.
  return jsonb_build_object(
    'ok', true,
    'decision', p_decision,
    'user_id', v_app.user_id,
    'role', v_app.role,
    'credential_type', v_app.credential_type,
    'credential_id', v_app.credential_id,
    'credential_jurisdiction', v_app.credential_jurisdiction,
    'verification_url', v_app.verification_url,
    'headline', v_app.headline,
    'content_hash', v_now);
end;
$$;

revoke all on function public.provider_review_decide(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.provider_review_decide(uuid, text, text, uuid, text) to service_role;

-- ── 3. keep it closed ─────────────────────────────────────────────────────
create or replace function public.review_integrity_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'provider_applications'
         and t.tgname = 'provider_applications_freeze'
         and not t.tgisinternal and t.tgenabled <> 'D'
    )
    -- every decided application carries the hash of what was decided
    and not exists (
      select 1 from public.provider_applications
       where status in ('approved','rejected') and content_hash is null
    );
$$;

revoke all on function public.review_integrity_intact() from public, anon, authenticated;
grant execute on function public.review_integrity_intact() to service_role;

-- ── 4. retrofit the guards that already failed this way ───────────────────
-- 0194 used `pg_trigger_depth() <= 1` and 0200 used a bespoke `klimr.stats_writer`
-- flag. Both work; having three mechanisms for one question does not. They move
-- to `is_privileged_writer()` so the next person finds one thing to understand.
create or replace function public.guard_moderation_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and not public.is_privileged_writer()
     and pg_trigger_depth() <= 1 then
    new.moderation_status := old.moderation_status;
  end if;
  return new;
end;
$$;

create or replace function public.guard_player_stats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_privileged_writer() then
    new.points := old.points;
    new.matches_played := old.matches_played;
    new.wins := old.wins;
  end if;
  return new;
end;
$$;

create or replace function public.recompute_player_points(
  p_user  uuid,
  p_sport text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '52 weeks';   -- ROLLING_WEEKS
  v_total  integer;
begin
  select coalesce(sum(points), 0) into v_total
    from (
      select points
        from (
          select points, earned_at from public.tournament_points
           where user_id = p_user and sport_key = p_sport and earned_at > v_cutoff
          union all
          select points, earned_at from public.queue_points
           where user_id = p_user and sport_key = p_sport and earned_at > v_cutoff
        ) pool
       order by points desc
       limit 8                                            -- ROLLING_BEST
    ) best;

  perform set_config('klimr.privileged_write', 'on', true);

  insert into public.player_sports (user_id, sport_key, points, updated_at)
  values (p_user, p_sport, v_total, now())
  on conflict (user_id, sport_key)
  do update set points = excluded.points, updated_at = excluded.updated_at;

  return v_total;
end;
$$;

create or replace function public.guard_business_protected()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_privileged_writer() then
    if tg_op = 'INSERT' then
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
