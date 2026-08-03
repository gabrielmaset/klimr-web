-- 0164_sport_formats.sql — the DB mirror of the canonical per-sport format
-- registry (lib/sports MATCH_FORMATS). Two jobs:
--   (1) sport_formats: reference data any layer can query — labels, team
--       structure (players per side, sides, total), defaults. Readable by
--       everyone; written only by migration (the registry is the source).
--   (2) Integrity: matches gains a composite FK on (sport_key, format), so
--       an invalid pairing (beach volleyball "singles") can't exist even via
--       a hand-crafted insert. Legacy beach matches created while the page
--       hard-coded Singles/Doubles are normalized to 2s first.
-- Adding a sport = one registry entry + mirrored seed rows here
-- (see docs/ADDING_A_SPORT.md). Idempotent.

create table if not exists public.sport_formats (
  sport_key        text not null,
  format_key       text not null,
  label            text not null,
  short_label      text not null,
  players_per_side int  not null,
  sides            int  not null default 2,
  total_players    int  not null,
  is_default       boolean not null default false,
  is_casual        boolean not null default false,
  sort             int  not null default 0,
  primary key (sport_key, format_key)
);

alter table public.sport_formats enable row level security;
drop policy if exists sport_formats_read on public.sport_formats;
create policy sport_formats_read on public.sport_formats for select using (true);

insert into public.sport_formats
  (sport_key, format_key, label, short_label, players_per_side, sides, total_players, is_default, is_casual, sort)
values
  ('tennis',           'singles',   'Singles',      '1v1',   1, 2, 2, true,  false, 0),
  ('tennis',           'doubles',   'Doubles',      '2v2',   2, 2, 4, false, false, 1),
  ('pickleball',       'doubles',   'Doubles',      '2v2',   2, 2, 4, true,  false, 0),
  ('pickleball',       'singles',   'Singles',      '1v1',   1, 2, 2, false, false, 1),
  ('padel',            'doubles',   'Doubles',      '2v2',   2, 2, 4, true,  false, 0),
  ('racquetball',      'singles',   'Singles',      '1v1',   1, 2, 2, true,  false, 0),
  ('racquetball',      'doubles',   'Doubles',      '2v2',   2, 2, 4, false, false, 1),
  ('racquetball',      'cutthroat', 'Cutthroat',    '1v1v1', 1, 3, 3, false, true,  2),
  ('beach_volleyball', '2s',        '2s (pairs)',   '2v2',   2, 2, 4, true,  false, 0),
  ('beach_volleyball', '3s',        '3s (triples)', '3v3',   3, 2, 6, false, false, 1),
  ('beach_volleyball', '4s',        '4s (fours)',   '4v4',   4, 2, 8, false, false, 2)
on conflict (sport_key, format_key) do update set
  label = excluded.label,
  short_label = excluded.short_label,
  players_per_side = excluded.players_per_side,
  sides = excluded.sides,
  total_players = excluded.total_players,
  is_default = excluded.is_default,
  is_casual = excluded.is_casual,
  sort = excluded.sort;

-- Normalize legacy rows BEFORE the FK: beach matches stored singles/doubles
-- while the page hard-coded those options; both map to the 2v2 standard.
update public.matches
   set format = '2s'
 where sport_key = 'beach_volleyball'
   and format in ('singles', 'doubles');

-- Belt-and-braces: any other row whose pairing the registry doesn't know
-- falls back to that sport's default format (no row is left to break the FK).
update public.matches m
   set format = (
     select sf.format_key from public.sport_formats sf
      where sf.sport_key = m.sport_key and sf.is_default
      limit 1
   )
 where not exists (
   select 1 from public.sport_formats sf
    where sf.sport_key = m.sport_key and sf.format_key = m.format
 )
 and exists (select 1 from public.sport_formats sf where sf.sport_key = m.sport_key);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'matches_sport_format_fkey') then
    alter table public.matches
      add constraint matches_sport_format_fkey
      foreign key (sport_key, format)
      references public.sport_formats (sport_key, format_key);
  end if;
end $$;
