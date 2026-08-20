-- 0074_division_group_setup.sql — per-division pool structure: number of groups and
-- target size per group. Each division is configured independently (e.g. fun = 6 groups
-- of 4, competitive = 2 groups of 4). The division's capacity is derived (groups × size)
-- and written to tournament_divisions.capacity, so there is no equal split of a shared total.

alter table public.tournament_divisions add column if not exists group_count int;
alter table public.tournament_divisions add column if not exists group_size  int;
