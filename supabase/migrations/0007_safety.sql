-- Klimr — child-safety incident ledger + quarantine (Phase 3 safety).
--
-- This is the application-layer scaffolding for known-CSAM handling. It does NOT
-- replace the legal/operational requirements documented in SAFETY.md:
--   * Register as an Electronic Service Provider with NCMEC before launch.
--   * Contract a detection vendor (Thorn Safer) or enable Cloudflare's CSAM
--     Scanning Tool to back the hash-matching webhook (lib/csam-scan.ts).
--   * Under 18 U.S.C. § 2258A: report apparent CSAM to the NCMEC CyberTipline,
--     preserve reported material for 90 days (§ 2258A(h)), and never proliferate
--     or casually view it. Failure to report is itself a federal crime.
--
-- Access model: safety_incidents has RLS enabled with NO policies for anon or
-- authenticated, so ONLY the service role (server-side, via createAdminClient) can
-- read or write it. The quarantine bucket is private (public = false) and has no
-- public-read policy — flagged media is never servable.

create table public.safety_incidents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('csam_hash_match', 'ai_csae_flag', 'user_report')),
  status text not null default 'open' check (status in ('open', 'reported', 'preserved', 'closed')),
  uploader_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  storage_path text,        -- path in the private 'quarantine' bucket
  sha256 text,
  perceptual_hash text,
  provider text,            -- which matcher flagged it (or 'ai')
  match_ref text,           -- opaque reference returned by the matcher
  ai_labels text[],
  detected_at timestamptz not null default now(),
  reported_at timestamptz,  -- when forwarded to NCMEC
  preserved_until timestamptz,
  notes text
);

-- RLS on, but no anon/authenticated policies: locked to the service role only.
alter table public.safety_incidents enable row level security;
revoke all on public.safety_incidents from anon, authenticated;
grant all on public.safety_incidents to service_role;

-- Private quarantine bucket. No public-read policy is created on purpose.
insert into storage.buckets (id, name, public)
values ('quarantine', 'quarantine', false)
on conflict (id) do nothing;
