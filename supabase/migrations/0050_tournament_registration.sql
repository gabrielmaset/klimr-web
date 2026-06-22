-- 0050_tournament_registration.sql — registration data model (Phase 1).
--
-- Adds the entities a sign-up needs:
--   tournament_divisions          — entry categories with fees
--   tournament_custom_fields      — organizer-defined registration questions
--   tournament_registrations      — one row per team entry or individual entry
--   tournament_registration_players — roster snapshot + per-member confirmation
--   tournament_payments           — payment-proof submissions (organizer-private)
--
-- RLS uses SECURITY DEFINER helper functions so policies that need to look across
-- tournaments / registrations don't trigger each other's policies (no recursion)
-- and don't require the caller to have read access to the joined rows.
--
-- Grants are inherited from the 0043 default privileges. Idempotent.

-- ---------- tables (created before policies so helpers + cross-refs resolve) ----------
create table if not exists public.tournament_divisions (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,
  description   text,
  fee_cents     int not null default 0,                       -- USD cents; 0 = free
  fee_basis     text not null default 'per_team' check (fee_basis in ('per_team','per_player')),
  capacity      int,                                          -- null = inherit/unlimited
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.tournament_custom_fields (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label         text not null,
  description   text,
  field_type    text not null default 'short_text'
    check (field_type in ('short_text','long_text','single_select','multi_select','number','date')),
  options       jsonb not null default '[]'::jsonb,           -- choices for select types
  required      boolean not null default false,
  scope         text not null default 'per_player' check (scope in ('per_team','per_player')),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.tournament_registrations (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  division_id   uuid references public.tournament_divisions(id) on delete set null,
  team_id       uuid references public.teams(id) on delete cascade,   -- null for individual entries
  registrant_id uuid not null references public.profiles(id) on delete cascade,  -- captain / the individual
  status        text not null default 'pending'
    check (status in ('pending','confirmed','waitlisted','withdrawn','declined')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','proof_submitted','confirmed','denied')),
  team_answers  jsonb not null default '{}'::jsonb,           -- per-team custom answers (keyed by field id)
  waitlist_position int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.tournament_registration_players (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,  -- denormalized for guards + RLS
  user_id         uuid not null references public.profiles(id) on delete cascade,
  is_reserve      boolean not null default false,
  played          boolean,                                    -- organizer-confirmed participation (ranking)
  waiver_accepted_at timestamptz,
  waiver_version  text,
  rules_accepted_at  timestamptz,
  rules_version   text,
  player_answers  jsonb not null default '{}'::jsonb,         -- per-player custom answers
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.tournament_payments (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  submitted_by    uuid not null references public.profiles(id) on delete cascade,
  proof_path      text,                                       -- path in the private payments bucket
  amount_cents    int,
  status          text not null default 'submitted' check (status in ('submitted','confirmed','denied')),
  deny_reason     text,
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------- RLS helper functions (security definer → bypass RLS for the lookup) ----------
create or replace function public.is_tournament_staff(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t where t.id = tid and t.owner_id = auth.uid())
      or exists (select 1 from public.tournament_managers m where m.tournament_id = tid and m.user_id = auth.uid());
$$;

create or replace function public.tournament_is_visible(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t where t.id = tid and t.status not in ('draft','cancelled'));
$$;

create or replace function public.is_registration_owner(reg uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournament_registrations r where r.id = reg and r.registrant_id = auth.uid());
$$;

create or replace function public.is_registration_player(reg uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournament_registration_players p where p.registration_id = reg and p.user_id = auth.uid());
$$;

grant execute on function public.is_tournament_staff(uuid)   to authenticated;
grant execute on function public.tournament_is_visible(uuid) to authenticated;
grant execute on function public.is_registration_owner(uuid) to authenticated;
grant execute on function public.is_registration_player(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.tournament_divisions            enable row level security;
alter table public.tournament_custom_fields        enable row level security;
alter table public.tournament_registrations        enable row level security;
alter table public.tournament_registration_players enable row level security;
alter table public.tournament_payments             enable row level security;

-- divisions: public (on a visible event) read; staff write.
drop policy if exists "divisions readable" on public.tournament_divisions;
create policy "divisions readable" on public.tournament_divisions
  for select to authenticated using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));
drop policy if exists "divisions insert" on public.tournament_divisions;
create policy "divisions insert" on public.tournament_divisions
  for insert to authenticated with check (is_tournament_staff(tournament_id));
drop policy if exists "divisions update" on public.tournament_divisions;
create policy "divisions update" on public.tournament_divisions
  for update to authenticated using (is_tournament_staff(tournament_id)) with check (is_tournament_staff(tournament_id));
drop policy if exists "divisions delete" on public.tournament_divisions;
create policy "divisions delete" on public.tournament_divisions
  for delete to authenticated using (is_tournament_staff(tournament_id));

-- custom fields: same access shape as divisions.
drop policy if exists "custom_fields readable" on public.tournament_custom_fields;
create policy "custom_fields readable" on public.tournament_custom_fields
  for select to authenticated using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));
drop policy if exists "custom_fields insert" on public.tournament_custom_fields;
create policy "custom_fields insert" on public.tournament_custom_fields
  for insert to authenticated with check (is_tournament_staff(tournament_id));
drop policy if exists "custom_fields update" on public.tournament_custom_fields;
create policy "custom_fields update" on public.tournament_custom_fields
  for update to authenticated using (is_tournament_staff(tournament_id)) with check (is_tournament_staff(tournament_id));
drop policy if exists "custom_fields delete" on public.tournament_custom_fields;
create policy "custom_fields delete" on public.tournament_custom_fields
  for delete to authenticated using (is_tournament_staff(tournament_id));

-- registrations: staff see all; the registrant (captain/individual) sees their own;
-- rostered players see the entry they're on.
drop policy if exists "registrations readable" on public.tournament_registrations;
create policy "registrations readable" on public.tournament_registrations
  for select to authenticated using (is_tournament_staff(tournament_id) or registrant_id = auth.uid() or is_registration_player(id));
drop policy if exists "registrations insert" on public.tournament_registrations;
create policy "registrations insert" on public.tournament_registrations
  for insert to authenticated with check (registrant_id = auth.uid());
drop policy if exists "registrations update" on public.tournament_registrations;
create policy "registrations update" on public.tournament_registrations
  for update to authenticated using (is_tournament_staff(tournament_id) or registrant_id = auth.uid()) with check (is_tournament_staff(tournament_id) or registrant_id = auth.uid());
drop policy if exists "registrations delete" on public.tournament_registrations;
create policy "registrations delete" on public.tournament_registrations
  for delete to authenticated using (is_tournament_staff(tournament_id) or registrant_id = auth.uid());

-- registration players: staff; the player themselves (to confirm); the registrant (to roster).
drop policy if exists "reg_players readable" on public.tournament_registration_players;
create policy "reg_players readable" on public.tournament_registration_players
  for select to authenticated using (is_tournament_staff(tournament_id) or user_id = auth.uid() or is_registration_owner(registration_id));
drop policy if exists "reg_players insert" on public.tournament_registration_players;
create policy "reg_players insert" on public.tournament_registration_players
  for insert to authenticated with check (is_tournament_staff(tournament_id) or is_registration_owner(registration_id));
drop policy if exists "reg_players update" on public.tournament_registration_players;
create policy "reg_players update" on public.tournament_registration_players
  for update to authenticated using (is_tournament_staff(tournament_id) or user_id = auth.uid() or is_registration_owner(registration_id)) with check (is_tournament_staff(tournament_id) or user_id = auth.uid() or is_registration_owner(registration_id));
drop policy if exists "reg_players delete" on public.tournament_registration_players;
create policy "reg_players delete" on public.tournament_registration_players
  for delete to authenticated using (is_tournament_staff(tournament_id) or is_registration_owner(registration_id));

-- payments: organizer-private — only staff and the submitter (never other players).
drop policy if exists "payments readable" on public.tournament_payments;
create policy "payments readable" on public.tournament_payments
  for select to authenticated using (is_tournament_staff(tournament_id) or submitted_by = auth.uid());
drop policy if exists "payments insert" on public.tournament_payments;
create policy "payments insert" on public.tournament_payments
  for insert to authenticated with check (submitted_by = auth.uid() and is_registration_owner(registration_id));
drop policy if exists "payments update" on public.tournament_payments;
create policy "payments update" on public.tournament_payments
  for update to authenticated using (is_tournament_staff(tournament_id) or submitted_by = auth.uid()) with check (is_tournament_staff(tournament_id) or submitted_by = auth.uid());
drop policy if exists "payments delete" on public.tournament_payments;
create policy "payments delete" on public.tournament_payments
  for delete to authenticated using (is_tournament_staff(tournament_id) or submitted_by = auth.uid());

-- ---------- indexes ----------
create index if not exists divisions_tournament_idx        on public.tournament_divisions (tournament_id, sort_order);
create index if not exists custom_fields_tournament_idx    on public.tournament_custom_fields (tournament_id, sort_order);
create index if not exists registrations_tournament_idx    on public.tournament_registrations (tournament_id, status);
create index if not exists registrations_registrant_idx    on public.tournament_registrations (registrant_id);
create index if not exists registrations_team_idx          on public.tournament_registrations (team_id);
create index if not exists reg_players_registration_idx    on public.tournament_registration_players (registration_id);
create index if not exists reg_players_user_idx            on public.tournament_registration_players (tournament_id, user_id);
create index if not exists payments_registration_idx       on public.tournament_payments (registration_id);
create index if not exists payments_tournament_idx         on public.tournament_payments (tournament_id, status);

-- One active entry per team / per individual, per tournament (withdrawals free the slot).
create unique index if not exists uniq_active_team_entry on public.tournament_registrations (tournament_id, team_id)
  where team_id is not null and status not in ('withdrawn','declined');
create unique index if not exists uniq_active_solo_entry on public.tournament_registrations (tournament_id, registrant_id)
  where team_id is null and status not in ('withdrawn','declined');
