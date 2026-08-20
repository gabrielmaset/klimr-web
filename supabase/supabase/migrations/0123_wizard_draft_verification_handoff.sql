-- 0123_wizard_draft_verification_handoff.sql — two pieces of signup infrastructure:
-- (1) profiles.onboarding_draft: the wizard autosaves every completed step here
--     (jsonb snapshot), so a half-finished signup survives reloads and device
--     switches; cleared on finish. Never flips the profile-completion gate.
-- (2) verification_handoffs: single-use, 30-minute tokens that carry a signup's
--     verification intent from desktop to phone (QR / copied link today; SMS via
--     Twilio when it lands). Service-role only — RLS on with no policies.

alter table public.profiles
  add column if not exists onboarding_draft jsonb;

create table if not exists public.verification_handoffs (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  consumed_at timestamptz
);

create index if not exists verification_handoffs_user_idx
  on public.verification_handoffs (user_id, created_at desc);

alter table public.verification_handoffs enable row level security;
