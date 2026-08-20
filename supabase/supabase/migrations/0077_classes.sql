-- 0077_classes.sql — Classes module: approved providers, classes, sessions, enrollments.
-- Only admin-approved coaches/providers can create classes. Classes hold defaults;
-- class_sessions hold the concrete dates (1 row for one-off, N rows for recurring);
-- class_enrollments track each player's sign-up / confirmation / attendance / payment.

-- ── Approved coaches/providers (admin-granted) ────────────────────────────────
create table if not exists public.class_providers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  status      text not null default 'approved' check (status in ('approved','revoked')),
  headline    text,
  bio         text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ── A class offering (one-off or recurring) ───────────────────────────────────
create table if not exists public.classes (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references auth.users(id) on delete cascade,
  sport_key         text not null,
  title             text not null,
  summary           text,
  description       text,
  status            text not null default 'draft' check (status in ('draft','published','cancelled')),
  level_min         numeric,
  level_max         numeric,
  capacity          int check (capacity is null or capacity > 0),  -- default per-session cap
  is_paid           boolean not null default false,
  price_cents       int not null default 0 check (price_cents >= 0),
  price_basis       text not null default 'per_session' check (price_basis in ('per_session','per_series')),
  recurrence        text not null default 'one_off' check (recurrence in ('one_off','recurring')),
  location_name     text,
  location_address  text,
  location_zip      text check (location_zip is null or location_zip ~ '^[0-9]{5}$'),
  location_lat      double precision,
  location_lng      double precision,
  location_place_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists classes_provider_idx on public.classes(provider_id);
create index if not exists classes_status_sport_idx on public.classes(status, sport_key);

-- ── Concrete sessions (occurrences) ───────────────────────────────────────────
create table if not exists public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  capacity    int check (capacity is null or capacity > 0),  -- null → inherit class.capacity
  status      text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_at  timestamptz not null default now()
);
create index if not exists class_sessions_class_idx on public.class_sessions(class_id, starts_at);
create index if not exists class_sessions_upcoming_idx on public.class_sessions(starts_at) where status = 'scheduled';

-- ── A player's enrollment in a session ────────────────────────────────────────
create table if not exists public.class_enrollments (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.class_sessions(id) on delete cascade,
  class_id       uuid not null references public.classes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'enrolled' check (status in ('enrolled','cancelled','attended','no_show','waitlisted')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required','pending','paid','refunded')),
  confirmed_at   timestamptz,        -- player confirmed they're attending
  enrolled_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, user_id)
);
create index if not exists class_enrollments_session_idx on public.class_enrollments(session_id);
create index if not exists class_enrollments_user_idx on public.class_enrollments(user_id, status);
create index if not exists class_enrollments_class_idx on public.class_enrollments(class_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.class_providers enable row level security;
alter table public.classes enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_enrollments enable row level security;

-- Table privileges (RLS is moot without these GRANTs for the authenticated role).
grant select on public.class_providers to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.class_sessions to authenticated;
grant select, insert, update, delete on public.class_enrollments to authenticated;

-- class_providers: any signed-in user can see who's an approved coach; only the
-- service role (admin actions) writes here, so no insert/update policy is needed.
drop policy if exists class_providers_read on public.class_providers;
create policy class_providers_read on public.class_providers for select to authenticated using (true);

-- classes: published classes are visible to everyone; a provider always sees their own.
drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select to authenticated
  using (status = 'published' or provider_id = auth.uid());

drop policy if exists classes_insert_provider on public.classes;
create policy classes_insert_provider on public.classes for insert to authenticated
  with check (
    provider_id = auth.uid()
    and exists (select 1 from public.class_providers p where p.user_id = auth.uid() and p.status = 'approved')
  );

drop policy if exists classes_update_owner on public.classes;
create policy classes_update_owner on public.classes for update to authenticated
  using (provider_id = auth.uid()) with check (provider_id = auth.uid());

drop policy if exists classes_delete_owner on public.classes;
create policy classes_delete_owner on public.classes for delete to authenticated
  using (provider_id = auth.uid());

-- class_sessions: readable when the parent class is readable; writable by the class provider.
drop policy if exists class_sessions_read on public.class_sessions;
create policy class_sessions_read on public.class_sessions for select to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and (c.status = 'published' or c.provider_id = auth.uid())));

drop policy if exists class_sessions_write on public.class_sessions;
create policy class_sessions_write on public.class_sessions for all to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()));

-- class_enrollments: a player manages their own; the class provider can read & update
-- (attendance + payment) the enrollments for their class.
drop policy if exists class_enrollments_read on public.class_enrollments;
create policy class_enrollments_read on public.class_enrollments for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()));

drop policy if exists class_enrollments_insert_self on public.class_enrollments;
create policy class_enrollments_insert_self on public.class_enrollments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists class_enrollments_update on public.class_enrollments;
create policy class_enrollments_update on public.class_enrollments for update to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()))
  with check (user_id = auth.uid() or exists (select 1 from public.classes c where c.id = class_id and c.provider_id = auth.uid()));

drop policy if exists class_enrollments_delete_self on public.class_enrollments;
create policy class_enrollments_delete_self on public.class_enrollments for delete to authenticated
  using (user_id = auth.uid());
