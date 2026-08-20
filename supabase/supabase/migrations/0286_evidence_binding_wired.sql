-- 0286_evidence_binding_wired.sql — S2: evidence is bound to bytes, and the
-- verifier that already existed is finally called. KFU-008 + KFU-009.
--
-- KFU-009 FINDING. 0245 built `verify_payment_proof_object()` — it confirms the
-- object exists in storage.objects, sits under the registration's path prefix,
-- and belongs to the uploader — proved it with an allow case and three denials,
-- and then nothing ever called it. `tournament_submit_payment_proof` still only
-- checks that the path string is non-empty. A verifier nobody calls is a comment.
--
-- KFU-008 FINDING. Screening verdicts are computed in memory and discarded. There
-- is no record binding "these bytes were screened by this scanner under this
-- policy", so a reviewed decision cannot be tied to the bytes it was made about,
-- and nothing detects an object replaced underneath an earlier verdict.
--
-- WHAT THIS ADDS
--   media_screenings          the evidence ledger: bucket, path, sha256 of the
--                             bytes, scanner provider AND version, policy
--                             version, verdict. Keyed so a REPLACED object has
--                             no evidence rather than inheriting the old row's.
--   media_evidence_current()  fail-closed publish predicate: evidence exists for
--                             THIS digest, from a real scanner (never 'none' or
--                             'mock'), not older than the caller's freshness
--                             bound.
--   payment proof wiring      the submit command now calls the 0245 verifier and
--                             records the object's fingerprint, so a byte swap
--                             under a reviewed decision is detectable.

-- ── 1. the media evidence ledger ────────────────────────────────────────────
create table if not exists public.media_screenings (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text not null,
  object_path      text not null,
  sha256           text not null,
  scanner_provider text not null,
  scanner_version  text not null,
  policy_version   text not null,
  verdict          text not null check (verdict in ('clean','match','undecided','csae_escalated')),
  labels           text[],
  screened_at      timestamptz not null default now()
);

-- Evidence is keyed by the BYTES, not by the path: replacing an object produces a
-- new digest, which has no evidence, which fails the publish predicate. That is
-- the whole point — a path-keyed ledger would let a swap inherit a clean verdict.
create unique index if not exists media_screenings_object_digest_idx
  on public.media_screenings (bucket_id, object_path, sha256);
create index if not exists media_screenings_recent_idx
  on public.media_screenings (screened_at desc);

alter table public.media_screenings enable row level security;
revoke all on public.media_screenings from anon, authenticated;
grant all on public.media_screenings to service_role;

comment on table public.media_screenings is
  'KFU-008: what was screened, by which scanner and policy version, and the digest of the exact bytes '
  'it saw. Keyed by digest so a replaced object cannot inherit an earlier clean verdict.';

create or replace function public.media_evidence_current(
  p_bucket text,
  p_path   text,
  p_sha256 text,
  p_max_age interval default interval '30 days'
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.media_screenings s
     where s.bucket_id = p_bucket
       and s.object_path = p_path
       and s.sha256 = p_sha256
       and s.verdict = 'clean'
       -- A scanner that is absent, disabled or a stand-in is not evidence. The
       -- fail-closed posture from 0005 applies to the RECORD as well as the scan.
       and s.scanner_provider not in ('none','mock','stub','disabled')
       and s.screened_at >= now() - p_max_age
  );
$$;

revoke all on function public.media_evidence_current(text, text, text, interval) from public, anon, authenticated;
grant execute on function public.media_evidence_current(text, text, text, interval) to service_role;

comment on function public.media_evidence_current is
  'KFU-008 publish predicate, fail-closed: is there a CLEAN screening for exactly these bytes, from a '
  'real scanner, within the freshness bound. Missing, stale, mock or digest-mismatched evidence all '
  'return false.';

-- ── 2. payment proof: call the verifier that already exists ─────────────────
alter table public.tournament_payments
  add column if not exists proof_fingerprint text;

comment on column public.tournament_payments.proof_fingerprint is
  'KFU-009: the Storage object fingerprint (etag/size/mtime) recorded when the proof was submitted, so '
  'bytes replaced under a reviewed decision are detectable.';

create or replace function public.payment_proof_fingerprint(p_path text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(o.metadata ->> 'eTag', '') || ':' ||
         coalesce(o.metadata ->> 'size', '') || ':' ||
         coalesce(to_char(o.updated_at, 'YYYYMMDDHH24MISS'), '')
    from storage.objects o
   where o.bucket_id = 'tournament-payments' and o.name = p_path;
$$;

revoke all on function public.payment_proof_fingerprint(text) from public, anon, authenticated;
grant execute on function public.payment_proof_fingerprint(text) to service_role;

create or replace function public.tournament_submit_payment_proof(
  p_registration uuid,
  p_proof_path text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
-- Paste-law: scalar assignment form throughout. The SQL editor scans raw text for
-- the keyword and validates the following word as a relation, so the record-style
-- form 0193 used cannot be pasted; the semantics are identical.
declare
  v_me uuid := auth.uid();
  v_exists boolean;
  v_registrant uuid;
  v_pay_status text;
  v_division uuid;
  v_tournament uuid;
  v_fee_basis text;
  v_fee_cents int;
  v_amount int;
  v_players int;
  v_fp text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if coalesce(p_proof_path,'') = '' then return jsonb_build_object('ok', false, 'error', 'no_proof'); end if;

  perform 1 from public.tournament_registrations where id = p_registration for update;
  v_exists := (select true from public.tournament_registrations where id = p_registration);
  if v_exists is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  v_registrant := (select r.registrant_id from public.tournament_registrations r where r.id = p_registration);
  v_pay_status := (select r.payment_status from public.tournament_registrations r where r.id = p_registration);
  v_division   := (select r.division_id from public.tournament_registrations r where r.id = p_registration);
  v_tournament := (select r.tournament_id from public.tournament_registrations r where r.id = p_registration);

  if v_registrant <> v_me then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if v_pay_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;

  -- KFU-009: the path is a CLAIM; storage.objects is the fact. 0245 built this
  -- verifier and proved it with an allow case and three denials; this is the call
  -- it never had. A guessed path, a path to nothing, another registration's
  -- prefix, or someone else's upload all stop here instead of being recorded as
  -- a submitted payment.
  if not public.verify_payment_proof_object(p_proof_path, v_me, p_registration) then
    return jsonb_build_object('ok', false, 'error', 'proof_object_invalid');
  end if;
  v_fp := public.payment_proof_fingerprint(p_proof_path);

  if v_division is not null then
    v_fee_basis := (select d.fee_basis from public.tournament_divisions d where d.id = v_division);
    v_fee_cents := (select d.fee_cents from public.tournament_divisions d where d.id = v_division);
    if v_fee_basis = 'per_team' then
      v_amount := coalesce(v_fee_cents, 0);
    elsif v_fee_basis is not null then
      v_players := (select count(*) from public.tournament_registration_players rp
                     where rp.registration_id = p_registration and rp.is_reserve = false);
      v_amount := coalesce(v_fee_cents, 0) * greatest(coalesce(v_players, 1), 1);
    end if;
  end if;

  insert into public.tournament_payments
    (registration_id, tournament_id, submitted_by, proof_path, proof_fingerprint, amount_cents, status)
  values
    (p_registration, v_tournament, v_me, p_proof_path, v_fp, v_amount, 'submitted');

  update public.tournament_registrations
     set payment_status = 'proof_submitted', updated_at = now()
   where id = p_registration;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.tournament_submit_payment_proof(uuid, text) from public, anon;
grant execute on function public.tournament_submit_payment_proof(uuid, text) to authenticated, service_role;

insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('public.media_evidence_current(text,text,text,interval)', 'trigger_service', 'service_role', false,
   'Fail-closed publish predicate; service-only.'),
  ('public.payment_proof_fingerprint(text)', 'trigger_service', 'service_role', false,
   'Reads storage.objects metadata; service-only.')
on conflict (signature) do update set class = excluded.class, note = excluded.note;

insert into public.data_inventory (table_name, user_ref, export_scope, dataset_name, erasure, note) values
  ('media_screenings', null, 'excluded_safety', null, 'retain_safety',
   'Screening evidence about uploaded objects; retained by safety policy and not part of a self-service export.')
on conflict (table_name) do update set export_scope = excluded.export_scope, erasure = excluded.erasure, note = excluded.note;

select public.journal_migration('0286', '0286_evidence_binding_wired.sql', null,
  'KFU-008 and KFU-009: a media screening ledger keyed by byte digest with a fail closed publish predicate that rejects missing stale or mock evidence, and the tournament payment proof command now calls the 0245 object verifier and records a fingerprint so replaced bytes are detectable.');
