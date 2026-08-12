-- 0245_evidence_binding.sql — binds a professional-review decision to ALL the
-- evidence it saw, and a tournament payment proof to a real object owned by the
-- registrant.
--
-- KRA-004 + KRA-006 (both P1, re-audit 2026-08-10). One shape, two surfaces: a
-- decision recorded against a subset of what it actually rested on.

-- ═══ KRA-004 — the review hash covered part of the evidence ══════════════
-- 0203 introduced `content_hash` so an approval names the exact version the
-- reviewer judged, and returns `changed_since_review` otherwise. It hashed the
-- identity and credential TEXT and omitted `document_path`, `phone` and the
-- attestations — while `app/admin/providers/page.tsx` signs and shows
-- `document_path` to the reviewer, which is the single most decision-relevant
-- item on the page. So an applicant could swap the document after the reviewer
-- opened it, the hash would not move, and the approval would apply to an
-- evidence set nobody had seen.
--
-- The freeze had the same gap: 0203 froze the fields it hashed.
-- REPLACES `provider_application_hash` in place — same name, same signature. It
-- must not be a new function beside the old one: 0203's freeze trigger and
-- `provider_review_decide()` both call the existing name, so a parallel copy
-- would leave every caller on the narrow hash while the wide one sat unused. That
-- is exactly what my 0243 draft did to `purge_orphan_feed_media`, and what 0214
-- recorded before that.
create or replace function public.provider_application_hash(p_app public.provider_applications)
returns text
language sql
immutable
as $$
  -- Built-in sha256(bytea), not pgcrypto's digest(): no extension dependency, so
  -- this behaves identically in the CI replay harness and on Supabase.
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
    -- KRA-004: the three the decision actually rested on and the hash ignored.
    -- `document_path` is the item the reviewer opens and signs a URL for, so it
    -- was the single most decision-relevant field — and the one that could change
    -- without invalidating the decision.
    coalesce(p_app.document_path, '') || '|' ||
    coalesce(p_app.phone, '') || '|' ||
    coalesce(p_app.attestations::text, '') || '|' ||
    coalesce(p_app.version::text, '1'),
    'UTF8')), 'hex');
$$;

-- Rebind every pending application to the wider hash. A pending review whose hash
-- moves here is CORRECT to invalidate: it means the reviewer's view and the stored
-- version were already able to disagree without anyone noticing.
update public.provider_applications a
   set content_hash = public.provider_application_hash(a.*)
 where a.status = 'pending';

-- ── the freeze must cover what the hash covers ───────────────────────────
-- 0203 froze the fields it hashed, so the same three were editable under review.
-- A hash nobody can rely on and a freeze with holes in it fail together.
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

  -- Withdrawing stays the applicant's escape hatch: visible, unlike editing.
  if not public.is_privileged_writer()
     and old.status = 'pending'
     and new.status = 'withdrawn'
     and new.role is not distinct from old.role
     and new.credential_id is not distinct from old.credential_id then
    return new;
  end if;

  if not public.is_privileged_writer() and old.status = 'pending' then
    if new.role is distinct from old.role
       or new.headline is distinct from old.headline
       or new.bio is distinct from old.bio
       or new.credential_type is distinct from old.credential_type
       or new.credential_id is distinct from old.credential_id
       or new.credential_jurisdiction is distinct from old.credential_jurisdiction
       or new.verification_url is distinct from old.verification_url
       or new.applicant_note is distinct from old.applicant_note
       -- KRA-004 additions.
       or new.document_path is distinct from old.document_path
       or new.phone is distinct from old.phone
       or new.attestations is distinct from old.attestations then
      raise exception 'application_frozen_while_pending';
    end if;
  end if;

  -- Any legitimate change re-derives the hash, so the two cannot disagree.
  new.content_hash := public.provider_application_hash(new);
  return new;
end $$;

-- ═══ KRA-006 — a payment proof bound to nothing ══════════════════════════
-- 0193's `tournament_submit_payment_proof` accepted `p_proof_path`, checked only
-- that it was non-empty and that the caller owned the registration, and inserted
-- it. It never confirmed the object exists, never checked who uploaded it, never
-- enforced the documented `registration-id` path prefix, and never bound a byte
-- digest. A registrant could submit another person's proof path, a guessed path,
-- or a path to nothing at all — and having submitted, could replace the bytes
-- underneath a reviewed decision.
--
-- The object is verified against `storage.objects`, which is the only place that
-- knows whether it exists and who owns it.
create or replace function public.verify_payment_proof_object(
  p_path       text,
  p_owner      uuid,
  p_registration uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'tournament-payments'
       and o.name = p_path
       -- The documented convention (0051): the registration id leads the path.
       -- Enforced here rather than trusted from the client component that
       -- happens to follow it.
       and o.name like p_registration::text || '/%'
       -- Uploaded by the person claiming it. `owner` is the auth uid Storage
       -- recorded at upload; a foreign object fails here.
       and o.owner = p_owner
  );
$$;

revoke all on function public.verify_payment_proof_object(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_payment_proof_object(text, uuid, uuid) to service_role;

comment on function public.verify_payment_proof_object is
  'KRA-006: does this Storage object exist, sit under this registration''s prefix, and belong to this '
  'uploader. A path string from a caller is a claim; storage.objects is the fact.';

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.evidence_binding_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the review hash covers the three fields KRA-004 named
    -- across EVERY overload, because sampling one of several is not a check
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'provider_application_hash'
         and (position('document_path' in pg_get_functiondef(p.oid)) = 0
              or position('attestations' in pg_get_functiondef(p.oid)) = 0
              or position('p_app.phone' in pg_get_functiondef(p.oid)) = 0)
    )
    -- and the freeze covers them too, or the hash is merely advisory
    and (select position('document_path' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'freeze_submitted_application' limit 1)
    and exists (select 1 from pg_trigger where tgname = 'provider_applications_freeze')
    -- no submitted application may carry a hash that disagrees with its contents
    and not exists (
      select 1 from public.provider_applications a
       where a.status = 'pending'
         and a.content_hash is distinct from public.provider_application_hash(a.*)
    );
$$;

revoke all on function public.evidence_binding_intact() from anon, authenticated, public;
grant execute on function public.evidence_binding_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 25)
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
