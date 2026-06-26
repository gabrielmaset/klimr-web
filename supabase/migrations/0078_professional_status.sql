-- 0078_professional_status.sql — professional-status applications + credential proof,
-- provider roles & identity-verification level, and a richer set of class options.

-- ── Applications to become a verified professional ────────────────────────────
-- (coach, trainer, athletic trainer, PT, dietitian, nutrition coach, massage,
--  mental performance, event organizer). Health roles carry a credential to verify.
create table if not exists public.provider_applications (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  role                    text not null,
  status                  text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  headline                text,
  bio                     text,
  credential_type         text,                 -- e.g. "California PT license", "CAMTC CMT", "BOC ATC", "RDN"
  credential_id           text,                 -- the license / certification number
  credential_jurisdiction text,                 -- e.g. "CA"
  verification_url        text,                 -- link to the public registry entry / proof
  applicant_note          text,
  review_note             text,
  reviewed_by             uuid references auth.users(id),
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists provider_applications_user_idx on public.provider_applications(user_id);
create index if not exists provider_applications_status_idx on public.provider_applications(status);

alter table public.provider_applications enable row level security;
grant select, insert, update on public.provider_applications to authenticated;

drop policy if exists provider_applications_read_self on public.provider_applications;
create policy provider_applications_read_self on public.provider_applications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists provider_applications_insert_self on public.provider_applications;
create policy provider_applications_insert_self on public.provider_applications for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists provider_applications_update_self on public.provider_applications;
create policy provider_applications_update_self on public.provider_applications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Admin review runs through the service role, which bypasses RLS.

-- ── Provider record: granted roles + identity-verification tier ───────────────
-- verification_level anticipates the future stepped-up checks (government-ID +
-- facial match, then background check). 'basic' = admin-reviewed credential only.
alter table public.class_providers add column if not exists roles text[] not null default '{}';
alter table public.class_providers add column if not exists verification_level text not null default 'basic'
  check (verification_level in ('basic','id_verified','background_checked'));

-- ── Richer class options ──────────────────────────────────────────────────────
alter table public.classes add column if not exists class_format text not null default 'group_class'
  check (class_format in ('group_class','clinic','private_lesson','workshop','camp','open_play'));
alter table public.classes add column if not exists level_label text not null default 'all'
  check (level_label in ('all','beginner','intermediate','advanced','pro'));
alter table public.classes add column if not exists age_group text not null default 'all_ages'
  check (age_group in ('all_ages','adults','youth','seniors'));
alter table public.classes add column if not exists gender_pref text not null default 'all'
  check (gender_pref in ('all','women','men'));
alter table public.classes add column if not exists what_to_bring text;
alter table public.classes add column if not exists prerequisites text;
alter table public.classes add column if not exists cancellation_policy text;
