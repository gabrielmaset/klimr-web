-- 0076_division_pool_remainder.sql — uneven pools: leftover teams beyond groups×per (folded into the pools, or as one smaller pool)
alter table public.tournament_divisions
  add column if not exists group_extra int not null default 0,
  add column if not exists group_extra_mode text not null default 'grow';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_divisions_group_extra_mode_chk') then
    alter table public.tournament_divisions
      add constraint tournament_divisions_group_extra_mode_chk check (group_extra_mode in ('grow', 'pool'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_divisions_group_extra_chk') then
    alter table public.tournament_divisions
      add constraint tournament_divisions_group_extra_chk check (group_extra >= 0);
  end if;
end $$;
