-- 0092_team_matches.sql — team-vs-team competition for Pro teams.
-- Flow: a manager of the challenger (home) team proposes a match against another
-- Pro team of the same sport → a manager of the challenged (away) team accepts or
-- declines → after it's played, a manager of either team records the result.
-- Built to scale: per-team + status indexes, membership checks via SECURITY DEFINER
-- helpers (no RLS recursion). Idempotent and safe to re-run.

-- ---------- helper: team manager (admin level owner|manager|staff) ----------
create or replace function public.is_team_manager(p_team uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = p_user and role in ('owner','manager','staff')
  );
$$;

create table if not exists public.team_matches (
  id uuid primary key default gen_random_uuid(),
  sport_key text not null,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz,
  location_text text,
  status text not null default 'proposed'
    check (status in ('proposed','scheduled','completed','declined','cancelled')),
  home_score int check (home_score is null or home_score >= 0),
  away_score int check (away_score is null or away_score >= 0),
  winner_team_id uuid references public.teams(id) on delete set null,
  note text check (note is null or length(note) <= 300),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_matches_distinct check (home_team_id <> away_team_id),
  constraint team_matches_winner_valid check (winner_team_id is null or winner_team_id in (home_team_id, away_team_id))
);

create index if not exists team_matches_home_idx on public.team_matches(home_team_id, scheduled_at);
create index if not exists team_matches_away_idx on public.team_matches(away_team_id, scheduled_at);
create index if not exists team_matches_status_idx on public.team_matches(status);

alter table public.team_matches enable row level security;

-- Readable by members of either involved team.
drop policy if exists "team_matches read by members" on public.team_matches;
create policy "team_matches read by members" on public.team_matches
  for select to authenticated
  using (public.is_team_member(home_team_id, auth.uid()) or public.is_team_member(away_team_id, auth.uid()));

-- Only a manager of the challenger (home) team may propose, as themselves.
drop policy if exists "team_matches insert by home manager" on public.team_matches;
create policy "team_matches insert by home manager" on public.team_matches
  for insert to authenticated
  with check (
    proposed_by = auth.uid()
    and status = 'proposed'
    and public.is_team_manager(home_team_id, auth.uid())
  );

-- Managers of either involved team may update (accept / decline / record / cancel).
-- Valid state transitions are enforced in the server actions.
drop policy if exists "team_matches update by managers" on public.team_matches;
create policy "team_matches update by managers" on public.team_matches
  for update to authenticated
  using (public.is_team_manager(home_team_id, auth.uid()) or public.is_team_manager(away_team_id, auth.uid()))
  with check (public.is_team_manager(home_team_id, auth.uid()) or public.is_team_manager(away_team_id, auth.uid()));

-- Table-level grants for the authenticated role (RLS still applies on top).
grant select, insert, update on public.team_matches to authenticated;
