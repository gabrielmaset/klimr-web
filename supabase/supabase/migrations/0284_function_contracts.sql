-- 0284_function_contracts.sql — B5 / KFU-031: policy dependency is not a
-- safety certificate.
--
-- FINDING (audit, accepted with the auditor's better design). 0268 grants
-- EXECUTE to the role that evaluates a policy, which is REQUIRED — an
-- anon-readable public page dies without it, and that was proven by an executed
-- baseline. The defect is the inference that ran alongside it: that a function
-- safe to evaluate INSIDE a row policy (where the arguments come from the row
-- and auth.uid()) is therefore safe as an arbitrary DIRECT RPC call (where the
-- caller chooses the arguments).
--
-- The auditor named a concrete instance rather than a principle:
-- `is_match_participant(match_id, user_id)` and `is_match_organizer(...)` are
-- SECURITY DEFINER, granted to authenticated because policies reference them,
-- and take a caller-supplied subject — so a direct call answers "is THAT person
-- in THAT match", which is a relationship oracle about other people.
--
-- VERIFIED BEFORE CHANGING ANYTHING: every policy call site passes auth.uid()
-- (0001 x4, 0011 x2, 0270 x1) and no application code calls either function.
-- They are POLICY-ONLY helpers in the taxonomy, so a caller guard cannot break
-- a legitimate caller — there isn't one.
--
-- WHAT THIS ADDS
--   1. In-body caller binding on both named helpers, matching the pattern
--      `is_blocked_pair` already uses (0237): a member may only ask about
--      themselves. Policies are unaffected because they pass auth.uid().
--   2. `public.identity_oracle_candidates()` — the general control. It reports
--      every policy-referenced public function that takes a uuid parameter and
--      whose body never consults auth.uid(), i.e. every function shaped like the
--      two above. This is the class, not the instances.
--   3. `public.stale_policy_grants()` — grants that outlived their reason: a
--      function executable by anon/authenticated that no policy references and
--      that no declared contract justifies. 0268 adds grants; nothing removed
--      them when a dependency disappeared.
--   4. `public.function_contracts` — the declarative registry the auditor asked
--      for: exact signature, class, and audience, so "safe to expose" is a
--      recorded decision rather than an inference from the catalog.

-- ── 1. caller binding on the two named helpers ──────────────────────────────
create or replace function public.is_match_participant(m_id uuid, uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- A member may only ask about themselves. Policies pass auth.uid(), so they
  -- are unaffected; a direct RPC asking about someone else is the oracle.
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception 'not_your_subject' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.match_participants mp
     where mp.match_id = m_id and mp.user_id = uid
  );
end;
$$;

create or replace function public.is_match_organizer(m_id uuid, uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception 'not_your_subject' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.matches m
     where m.id = m_id and m.organizer_id = uid
  );
end;
$$;

-- The general control (below) found seven more functions of the same shape than
-- the two the audit named. Call sites were checked one by one before binding:
-- is_team_manager, is_team_member and is_business_manager are called ONLY as
-- (object, auth.uid()) in every policy and trigger, so binding them is safe.
-- is_conversation_participant is NOT bound here: 0011 legitimately calls it as
-- (conversation_id, recipient_id) to test a second subject, which is exactly the
-- "do not apply one blanket rewrite" case the auditor flagged. It stays declared
-- and reported until its internal and public contracts are split.

create or replace function public.is_team_manager(p_team uuid, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'not_your_subject' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.team_members m
     where m.team_id = p_team and m.user_id = p_user and m.role in ('owner','manager','staff')
  );
end; $$;

create or replace function public.is_team_member(p_team uuid, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'not_your_subject' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.team_members m where m.team_id = p_team and m.user_id = p_user
  );
end; $$;

-- ── 2. the declarative contract registry ────────────────────────────────────
create table if not exists public.function_contracts (
  signature   text primary key,
  class       text not null check (class in ('public_rpc','policy_only','trigger_service','anon_predicate')),
  audience    text not null default 'authenticated',
  caller_bound boolean not null default false,
  note        text,
  declared_at timestamptz not null default now()
);

alter table public.function_contracts enable row level security;
revoke all on public.function_contracts from anon, authenticated;
grant all on public.function_contracts to service_role;

comment on table public.function_contracts is
  'KFU-031: exact-signature declarations of what each exposed function IS — a caller-bound public RPC, '
  'a policy-only helper, a trigger/service helper, or an intentionally anonymous predicate. Exposure is '
  'a recorded decision, not an inference from policy dependency.';

insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('public.is_match_participant(uuid,uuid)', 'policy_only', 'authenticated', true,
   'Referenced by match/chat policies which pass auth.uid(). Caller-bound since 0284; no application caller.'),
  ('public.is_match_organizer(uuid,uuid)', 'policy_only', 'authenticated', true,
   'Referenced by match request/participant policies which pass auth.uid(). Caller-bound since 0284.'),
  ('public.is_blocked_pair(uuid,uuid)', 'policy_only', 'authenticated', true,
   'Kept granted by measurement (0237): revoking breaks the posts policy. Guarded in body.'),
  ('public.tournament_is_visible(uuid)', 'anon_predicate', 'anon', false,
   'Deliberately anonymous: logged-out tournament pages evaluate it. Takes no identity argument.'),
  ('public.is_tournament_staff(uuid,uuid)', 'anon_predicate', 'anon', false,
   'Required by anon-readable tournament policies (0268 executed baseline).'),
  ('public.is_team_manager(uuid,uuid)', 'policy_only', 'authenticated', true,
   'Every call site passes auth.uid(); caller-bound since 0284.'),
  ('public.is_team_member(uuid,uuid)', 'policy_only', 'authenticated', true,
   'Every call site passes auth.uid(); caller-bound since 0284.'),
  ('public.is_conversation_participant(uuid,uuid)', 'policy_only', 'authenticated', false,
   'NOT caller-bound: 0011 legitimately evaluates a second subject (conversation_id, recipient_id). '
   'Needs its internal and public contracts split — tracked, and still reported by '
   'identity_oracle_candidates() so it cannot be forgotten.'),
  ('public.match_is_open(uuid)', 'policy_only', 'authenticated', true,
   'Takes a match id, not an identity — cannot be an arbitrary-subject oracle.'),
  ('public.is_business_manager(uuid,uuid)', 'policy_only', 'authenticated', false,
   'Called as (business, auth.uid()) in policies; binding deferred to the business packet so this '
   'migration stays reviewable. Reported until then.')
on conflict (signature) do update
  set class = excluded.class, audience = excluded.audience,
      caller_bound = excluded.caller_bound, note = excluded.note;

-- Exact-signature allowlist for every RPC the application actually calls,
-- extracted from the call sites at 0284. This is what makes stale_policy_grants
-- meaningful: a grant is stale when no policy needs it AND no contract claims it.
insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('accept_connection(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('accept_substitution(uuid,jsonb,boolean,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('account_active_for_email(text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('admin_force_end_session(uuid,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('block_player(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('browse_kind(text,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('bump_article_read(text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('can_i_act_on(uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('chat_unread_count()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('check_rate_limit(text,integer,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('chrome_data()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('claim_jobs(text,integer,text,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('claim_live_search(text,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('claim_storage_deletions(integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('class_cancel_enrollment(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('class_enroll(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('clear_code_attempts(text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('code_lock_seconds(text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('complete_job(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('court_data_quality()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('courts_finder(double precision,double precision,double precision)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('courtside_authorize(uuid,text,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('courtside_fleet_status()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('courtside_heartbeat(uuid,text,text,text,text,integer,uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('courtside_issue_enrollment(uuid,text,text,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('courtside_register(uuid,text,text,text,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('current_admin_role()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('discoverable_players(uuid[])', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('enqueue_job(text,jsonb,text,timestamp with time zone,integer,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('event_admit(uuid,uuid,timestamp with time zone,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('fail_job(uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('feed_type_counts(text,double precision,double precision,double precision)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('fleet_metric_detail(text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('fleet_metrics()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('follow_player(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('generate_investor_codes(integer,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('generate_invite_codes(integer,integer,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('get_ranked_feed(text,integer,double precision,double precision,double precision)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('global_search(text,integer,text[])', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('grant_hygiene_intact()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('klimr_readiness()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('klimr_ready(integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('liveness_run(integer,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('mark_storage_deletion(uuid,boolean,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('marketplace_offer_create(uuid,integer,text,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('marketplace_offer_respond(uuid,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('match_confirm_offer(uuid,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('match_promote_waitlist(uuid,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('merge_format_config(uuid,jsonb,timestamp with time zone)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('moderation_reentry_intact()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('mutual_connections(uuid,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('note_code_failure(text,integer,integer,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('people_you_may_know(integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('perf_report(integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('place_on_team(uuid,uuid,text,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('played_together_counts(uuid[])', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('players_open_to_requests(uuid[])', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('profile_boundary_intact()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('provider_review_decide(uuid,text,text,uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('prune_perf_samples()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('pymk_dismiss(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('pymk_valid_targets(uuid[])', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('queue_boundary_intact()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('queue_finish_match(uuid,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('queue_join_full_team(uuid,text[],text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('queue_poll_head(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('queue_start_next(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('ranked_players(text,text,text,text,integer,integer,integer,integer)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('ranking_data_quality()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('recompute_player_points(uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('record_health_snapshot()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('relationship_context(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('remove_connection(uuid,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('replay_job(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('report_post(uuid,text,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('request_connection(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('resolve_feed_post(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('respond_sponsorship(uuid,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('rum_ingest(text,integer,text,boolean,bigint)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('schema_manifest_missing()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('shift_tournament_plan(uuid,interval)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_ask_to_join(uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_invite_respond(uuid,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_leave(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_remove_member(uuid,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_resolve_join_request(uuid,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_transfer_ownership(uuid,uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('team_withdraw_join_request(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_boundary_intact()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_clear_match(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_register(uuid,uuid,uuid,jsonb,boolean,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_register_team(uuid,uuid,uuid,jsonb,jsonb,boolean,boolean)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_review_payment(uuid,text,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_score_match(uuid,integer,integer,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('tournament_submit_payment_proof(uuid,text)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('unblock_player(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('unfollow_player(uuid)', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).'),
  ('video_disabled_intact()', 'public_rpc', 'authenticated', false, 'Application-called RPC (extracted from app/lib/components call sites at 0284).')
on conflict (signature) do update
  set class = excluded.class, note = excluded.note;

-- ── 3. the general controls ─────────────────────────────────────────────────
create or replace function public.identity_oracle_candidates()
returns table (signature text, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.oid::regprocedure::text,
         'policy-referenced, takes a uuid argument, body never consults auth.uid()'
    from pg_depend d
    join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
    join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
   where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and exists (
       select 1 from unnest(p.proargtypes) t(oid) where t.oid = 'uuid'::regtype
     )
     and coalesce(p.prosrc, '') not like '%auth.uid()%'
     and not exists (
       select 1 from public.function_contracts fc
        where fc.signature = p.oid::regprocedure::text
          and fc.caller_bound
     );
$$;

revoke all on function public.identity_oracle_candidates() from public, anon, authenticated;
grant execute on function public.identity_oracle_candidates() to service_role;

comment on function public.identity_oracle_candidates is
  'KFU-031 control: policy-referenced functions shaped like an arbitrary-subject oracle — they take a '
  'uuid and never consult auth.uid(), so a direct RPC caller chooses the subject. Declaring a function '
  'caller_bound in function_contracts clears it.';

create or replace function public.stale_policy_grants()
returns table (signature text, grantee text)
language sql
stable
security definer
set search_path = public
as $$
  select p.oid::regprocedure::text, g.role_name
    from pg_proc p
    cross join lateral (values ('anon'), ('authenticated')) as g(role_name)
   where p.pronamespace = 'public'::regnamespace
     and p.prokind in ('f','p')
     and has_function_privilege(g.role_name, p.oid, 'EXECUTE')
     -- Extension-owned functions (pg_trgm, citext, uuid-ossp …) carry the
     -- extension's own grants; they are not ours to revoke and reporting them
     -- would bury the signal this control exists to raise.
     and not exists (
       select 1 from pg_depend ed
        where ed.objid = p.oid and ed.deptype = 'e'
     )
     -- Trigger functions cannot be invoked directly (PostgreSQL refuses:
     -- "trigger functions can only be called as triggers"), so a grant on one is
     -- untidy rather than exposure. Excluded on that principle — not as an
     -- accepted tolerance — so the report shows only grants that could actually
     -- be called. Tidying them is a follow-on.
     and p.prorettype <> 'trigger'::regtype
     -- no policy references it any more …
     and not exists (
       select 1 from pg_depend d
        join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
       where d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
     )
     -- … and no declared contract justifies exposing it
     and not exists (
       select 1 from public.function_contracts fc
        where fc.signature = p.oid::regprocedure::text
     );
$$;

revoke all on function public.stale_policy_grants() from public, anon, authenticated;
grant execute on function public.stale_policy_grants() to service_role;

comment on function public.stale_policy_grants is
  'KFU-031 control: EXECUTE grants that outlived their reason — no policy references the function and no '
  'declared contract justifies it. 0268 adds grants; this is what removes the blind spot when a '
  'dependency or audience disappears. Reported, not auto-revoked: revoking a live grant is the failure '
  'mode this project already survived once.';

-- ── 4. least privilege, applied to what the control just found ─────────────
-- Running the new stale-grant control on this very schema reported three
-- functions added earlier TODAY that carry an authenticated grant nothing needs:
--   member_write_allowed(uuid)  takes a caller-supplied subject, so a direct RPC
--                               call answers "is THAT account suspended or
--                               un-onboarded" — an oracle I introduced in 0279
--                               and did not catch until this control existed.
--   caller_aal(), require_aal2() internal assurance helpers from 0281.
-- Every caller of these is a SECURITY DEFINER function (enforce_active_member,
-- enforce_aal2_owner_change), which executes with the definer's privileges — so
-- revoking the member grant cannot break the enforcement paths, and the suites
-- prove exactly that.
revoke execute on function public.member_write_allowed(uuid) from authenticated;
revoke execute on function public.caller_aal() from authenticated;
revoke execute on function public.require_aal2() from authenticated;

insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('public.member_write_allowed(uuid)', 'trigger_service', 'service_role', false,
   'Called only by enforce_active_member (SECURITY DEFINER). Member grant revoked in 0284: it took a '
   'caller-supplied subject and leaked account state about other people.'),
  ('public.caller_aal()', 'trigger_service', 'service_role', false,
   'Internal assurance helper; member grant revoked in 0284.'),
  ('public.require_aal2()', 'trigger_service', 'service_role', false,
   'Internal assurance guard; member grant revoked in 0284.'),
  ('public.attest_adult(date)', 'public_rpc', 'authenticated', true,
   'Intended member API for onboarding: derives the subject from auth.uid() and takes no identity '
   'argument, so it cannot act on another account.')
on conflict (signature) do update
  set class = excluded.class, audience = excluded.audience,
      caller_bound = excluded.caller_bound, note = excluded.note;

select public.journal_migration('0284', '0284_function_contracts.sql', null,
  'KFU-031: caller binding on the two named policy only helpers so a direct RPC cannot choose the subject, plus a declarative exact signature contract registry and two general controls that report identity oracle shaped functions and grants that outlived the policy dependency that justified them.');
