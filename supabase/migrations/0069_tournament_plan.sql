-- 0069_tournament_plan.sql — run-of-show day planner. A simple agenda of timed
-- items for the event day(s): food delivery, sponsor setup, games start, DJ,
-- ceremonies, etc. Deliberately independent of matches, so organizers can plan
-- before any draw. Staff-only — a private planning tool, not shown publicly.
-- Idempotent.

create table if not exists public.tournament_plan_items (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  title         text not null,
  kind          text not null default 'general'
                  check (kind in ('general','games','food','sponsor','music','setup','ceremony','staff')),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  notes         text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists tournament_plan_items_t_idx on public.tournament_plan_items (tournament_id, starts_at);

alter table public.tournament_plan_items enable row level security;

grant select, insert, update, delete on public.tournament_plan_items to authenticated;
grant all on public.tournament_plan_items to service_role;

-- Owner/managers manage the plan; it is not exposed to the public.
drop policy if exists "plan items staff" on public.tournament_plan_items;
create policy "plan items staff" on public.tournament_plan_items
  for all to authenticated
  using (is_tournament_staff(tournament_id))
  with check (is_tournament_staff(tournament_id));
