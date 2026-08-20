-- 0049_tournaments.sql — tournament foundations (Phase 0).
--
-- Introduces the core "tournament" entity: a temporary, owner-run hub with a
-- public event page at /e/<code> and an organizer workspace. This migration
-- creates the two foundational tables (tournaments, tournament_managers) with
-- RLS; later migrations add registrations, payments, divisions, brackets, etc.
--
-- Also promotes beach volleyball to a first-class sport so it can be ranked and
-- used for teams + tournaments.
--
-- Table-level GRANTs are inherited automatically from the default privileges set
-- in 0043, so this migration only declares tables, RLS, and per-row policies.
-- Idempotent (guarded creates + drop-if-exists on policies).

-- ---------- beach volleyball becomes a Klimr sport ----------
insert into public.sports (key, name, skill_system)
values ('beach_volleyball', 'Beach Volleyball', 'none')
on conflict (key) do nothing;

-- ---------- tables (created before policies so cross-references resolve) ----------
create table if not exists public.tournaments (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles(id) on delete cascade,
  code                  text not null unique,                 -- public link: /e/<code>
  title                 text not null,
  sport_key             text not null references public.sports(key),
  status                text not null default 'draft'
    check (status in ('draft','published','registration_open','registration_closed','in_progress','completed','archived','cancelled')),
  entry_type            text not null default 'team'
    check (entry_type in ('individual','team')),
  visibility            text not null default 'public'
    check (visibility in ('public','unlisted')),
  summary               text,
  description           text,
  -- when & where
  starts_at             timestamptz,
  ends_at               timestamptz,
  timezone              text,
  location_name         text,
  location_address      text,
  location_lat          double precision,
  location_lng          double precision,
  location_place_id     text,
  -- registration window & size
  registration_opens_at timestamptz,
  registration_deadline timestamptz,
  capacity              int,                                  -- null = unlimited
  -- gender eligibility (counts M/F only; 0 = no minimum)
  min_women             int not null default 0,
  min_men               int not null default 0,
  -- per-team reserves allowed (capped by sport in the app)
  reserves_allowed      int not null default 0,
  -- presentation
  cover_path            text,
  logo_path             text,
  -- features
  weather_enabled       boolean not null default false,
  -- flexible engine config (pools, knockout seeding, divisions live here for now)
  format_config         jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.tournament_managers (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null default 'manager' check (role in ('manager')),
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

-- ---------- RLS ----------
alter table public.tournaments        enable row level security;
alter table public.tournament_managers enable row level security;

-- tournaments: owners & managers see their own at any status; everyone signed-in
-- sees it once it's past draft (and not cancelled). "unlisted" only affects Explore
-- listing (filtered in app queries) so the /e/<code> page resolves for anyone with
-- the link.
drop policy if exists "tournaments readable" on public.tournaments;
create policy "tournaments readable" on public.tournaments
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.tournament_managers m where m.tournament_id = tournaments.id and m.user_id = auth.uid())
    or status not in ('draft','cancelled')
  );

drop policy if exists "tournaments insert own" on public.tournaments;
create policy "tournaments insert own" on public.tournaments
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "tournaments update own" on public.tournaments;
create policy "tournaments update own" on public.tournaments
  for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.tournament_managers m where m.tournament_id = tournaments.id and m.user_id = auth.uid())
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from public.tournament_managers m where m.tournament_id = tournaments.id and m.user_id = auth.uid())
  );

drop policy if exists "tournaments delete own" on public.tournaments;
create policy "tournaments delete own" on public.tournaments
  for delete to authenticated
  using (owner_id = auth.uid());

-- tournament_managers: visible to the manager themselves, the owner, and anyone
-- who can see the tournament (so the public page can list organizing staff).
-- Only the owner adds or removes managers.
drop policy if exists "tournament_managers readable" on public.tournament_managers;
create policy "tournament_managers readable" on public.tournament_managers
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_managers.tournament_id
        and (t.owner_id = auth.uid() or t.status not in ('draft','cancelled'))
    )
  );

drop policy if exists "tournament_managers insert by owner" on public.tournament_managers;
create policy "tournament_managers insert by owner" on public.tournament_managers
  for insert to authenticated
  with check (
    exists (select 1 from public.tournaments t where t.id = tournament_managers.tournament_id and t.owner_id = auth.uid())
  );

drop policy if exists "tournament_managers delete by owner" on public.tournament_managers;
create policy "tournament_managers delete by owner" on public.tournament_managers
  for delete to authenticated
  using (
    exists (select 1 from public.tournaments t where t.id = tournament_managers.tournament_id and t.owner_id = auth.uid())
  );

-- ---------- indexes ----------
create index if not exists tournaments_owner_idx        on public.tournaments (owner_id);
create index if not exists tournaments_status_idx       on public.tournaments (status);
create index if not exists tournaments_sport_idx        on public.tournaments (sport_key);
create index if not exists tournament_managers_user_idx on public.tournament_managers (user_id);
