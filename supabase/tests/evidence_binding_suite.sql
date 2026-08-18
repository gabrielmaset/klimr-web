-- evidence_binding_suite.sql — KFU-008 / KFU-009 closure control.
-- Proves evidence is bound to BYTES (not paths), that missing/stale/mock evidence
-- fails closed, and that the payment-proof command now calls the verifier that
-- 0245 built and nothing called.
\set ON_ERROR_STOP on
begin;

-- ── KFU-008: the evidence ledger ────────────────────────────────────────────
insert into public.media_screenings
  (bucket_id, object_path, sha256, scanner_provider, scanner_version, policy_version, verdict)
values ('post-media','u1/photo.jpg','aaaa1111','openai-omni','2026-06','p3','clean');

select case when public.media_evidence_current('post-media','u1/photo.jpg','aaaa1111')
  then 'ok   EVB BASELINE clean evidence for these exact bytes permits publication'
  else 'EVB-FAIL valid evidence was rejected' end;

select case when public.media_evidence_current('post-media','u1/photo.jpg','bbbb2222') = false
  then 'ok   EVB REPLACED BYTES have no evidence (digest-keyed, not path-keyed)'
  else 'EVB-FAIL a replaced object inherited an earlier clean verdict' end;

select case when public.media_evidence_current('post-media','u1/never-screened.jpg','cccc3333') = false
  then 'ok   EVB an unscreened object fails closed'
  else 'EVB-FAIL missing evidence permitted publication' end;

-- a mock/disabled scanner is not evidence
insert into public.media_screenings
  (bucket_id, object_path, sha256, scanner_provider, scanner_version, policy_version, verdict)
values ('post-media','u2/mocked.jpg','dddd4444','mock','0','p3','clean');
select case when public.media_evidence_current('post-media','u2/mocked.jpg','dddd4444') = false
  then 'ok   EVB a mock or disabled scanner does not count as evidence'
  else 'EVB-FAIL a stand-in scanner satisfied the publish gate' end;

-- stale evidence is not current evidence
insert into public.media_screenings
  (bucket_id, object_path, sha256, scanner_provider, scanner_version, policy_version, verdict, screened_at)
values ('post-media','u3/old.jpg','eeee5555','openai-omni','2026-01','p1','clean', now() - interval '90 days');
select case when public.media_evidence_current('post-media','u3/old.jpg','eeee5555', interval '30 days') = false
  then 'ok   EVB STALE evidence fails the freshness bound'
  else 'EVB-FAIL 90-day-old evidence passed a 30-day bound' end;
select case when public.media_evidence_current('post-media','u3/old.jpg','eeee5555', interval '365 days')
  then 'ok   EVB the freshness bound is the caller''s, not a hard-coded constant'
  else 'EVB-FAIL a wider bound still rejected the same evidence' end;

-- a non-clean verdict never permits publication
insert into public.media_screenings
  (bucket_id, object_path, sha256, scanner_provider, scanner_version, policy_version, verdict)
values ('post-media','u4/flagged.jpg','ffff6666','openai-omni','2026-06','p3','match');
select case when public.media_evidence_current('post-media','u4/flagged.jpg','ffff6666') = false
  then 'ok   EVB a match verdict never satisfies the publish gate'
  else 'EVB-FAIL flagged content could publish' end;

-- the same bytes cannot be recorded twice for one object (evidence is a fact)
do $$
begin
  begin
    insert into public.media_screenings
      (bucket_id, object_path, sha256, scanner_provider, scanner_version, policy_version, verdict)
    values ('post-media','u1/photo.jpg','aaaa1111','openai-omni','2026-06','p3','clean');
    raise exception 'EVB-FAIL duplicate evidence row was accepted';
  exception when unique_violation then null;
  end;
end $$;
select 'ok   EVB evidence for one object and digest is recorded once';

-- members cannot read or write the ledger
select case when has_table_privilege('authenticated','public.media_screenings','select') = false
        and has_table_privilege('authenticated','public.media_screenings','insert') = false
  then 'ok   EVB the evidence ledger is service-only'
  else 'EVB-FAIL members can reach the evidence ledger' end;

-- ── KFU-009: the payment-proof command calls the verifier ───────────────────
select case when position('verify_payment_proof_object' in
             pg_get_functiondef('public.tournament_submit_payment_proof(uuid,text)'::regprocedure)) > 0
  then 'ok   EVB the payment-proof command now CALLS the 0245 object verifier'
  else 'EVB-FAIL the verifier is still uncalled' end;

select case when position('proof_fingerprint' in
             pg_get_functiondef('public.tournament_submit_payment_proof(uuid,text)'::regprocedure)) > 0
  then 'ok   EVB the submitted proof records a byte fingerprint for later comparison'
  else 'EVB-FAIL no fingerprint is bound at submission' end;

-- an unverifiable path is refused rather than recorded (no Storage object exists
-- in this harness, so every path is unverifiable — which is the denial case)
insert into auth.users (id, email) values ('ca000000-0000-0000-0000-0000000000a1','evb@test.local')
  on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth)
values ('ca000000-0000-0000-0000-0000000000a1','EVB User','1990-01-01')
on conflict (id) do update set date_of_birth = excluded.date_of_birth;
select set_config('request.jwt.claim.sub','ca000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
select case when (public.tournament_submit_payment_proof(
                   '00000000-0000-0000-0000-0000000000ff'::uuid, 'made/up/path.png') ->> 'error') is not null
  then 'ok   EVB an unverifiable proof path is refused, not recorded'
  else 'EVB-FAIL a fabricated proof path was accepted' end;

rollback;
