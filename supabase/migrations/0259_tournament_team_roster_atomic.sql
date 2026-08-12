-- 0259_tournament_team_roster_atomic.sql — a team entry and its roster are one
-- transaction, so an entry can never exist with the wrong players in it.
--
-- KRA-035 (P1, re-audit 2026-08-10). `tournament_register` inserts the CAPTAIN
-- into `tournament_registration_players` as part of its locked command. The
-- caller then bulk-inserts the rest of the roster in a separate statement,
-- outside that transaction, with `{ error }` discarded — supabase-js does not
-- throw, so nothing notices.
--
-- Three outcomes, all silent:
--
--  · DUPLICATE CAPTAIN. The roster from the team page includes the captain, and
--    the command has already inserted them. `tournament_registration_players`
--    has no unique key on (registration_id, user_id) — verified — so the captain
--    appears twice. Under KRA-034's person-unit capacity that is now a real
--    counting error: a two-person entry occupies three seats.
--
--  · SILENT OMISSION. If the bulk insert fails — RLS, a constraint, a dropped
--    connection between two round trips — the registration exists with ONE
--    player. The captain is entered and their teammates are not, and the
--    response says `ok: true`.
--
--  · POINTS CONSEQUENCE. `tournament_points` is awarded per registration player.
--    A duplicated captain earns twice; an omitted teammate earns nothing. Under
--    owner directive D-35 points are currency, so this is not a cosmetic
--    inconsistency — it is a credit awarded to the wrong ledger.
--
-- The roster now travels INTO the command as an argument. One transaction: either
-- the entry and its complete roster exist, or neither does.

-- The missing invariant, first. A person cannot be in an entry twice, and this
-- must hold for every path — the captain's flow, an organiser's, a support fix.
-- De-duplicate before constraining, keeping the non-reserve row where a person
-- appears as both (being a starter outranks being a substitute).
delete from public.tournament_registration_players a
 using public.tournament_registration_players b
 where a.registration_id = b.registration_id
   and a.user_id = b.user_id
   and (a.is_reserve, a.ctid) > (b.is_reserve, b.ctid);

create unique index if not exists tournament_registration_players_unique
  on public.tournament_registration_players (registration_id, user_id);

create or replace function public.tournament_register_team(
  p_tournament    uuid,
  p_division      uuid default null,
  p_team          uuid default null,
  p_roster        jsonb default '[]'::jsonb,   -- [{user_id, is_reserve}]
  p_answers       jsonb default '{}'::jsonb,
  p_accept_waiver boolean default false,
  p_accept_rules  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_out   jsonb;
  v_reg   uuid;
  v_added int := 0;
begin
  -- Delegate every check and the capacity decision to the one command that owns
  -- them (0193 + 0258). Duplicating that logic here is how the UI and the command
  -- drifted apart in KRA-034 — one owner per rule.
  v_out := public.tournament_register(
    p_tournament, p_division, p_team, p_answers, p_accept_waiver, p_accept_rules);

  if coalesce(v_out ->> 'ok', 'false') <> 'true' then
    return v_out;
  end if;
  v_reg := (v_out ->> 'registration_id')::uuid;

  -- Same transaction as the registration. A failure here rolls the entry back
  -- rather than leaving a one-player team entry reported as success.
  --
  -- `on conflict do nothing` against the new unique index handles the captain,
  -- whom `tournament_register` has already inserted and whom the team page
  -- includes in the roster it sends.
  insert into public.tournament_registration_players
    (registration_id, tournament_id, user_id, is_reserve)
  select v_reg, p_tournament, (r ->> 'user_id')::uuid,
         coalesce((r ->> 'is_reserve')::boolean, false)
    from jsonb_array_elements(coalesce(p_roster, '[]'::jsonb)) r
   where (r ->> 'user_id') is not null
     -- Only real members of the entered team. A caller cannot roster a stranger,
     -- and the app's own list is not the authority for that.
     and (p_team is null or exists (
       select 1 from public.team_members tm
        where tm.team_id = p_team and tm.user_id = (r ->> 'user_id')::uuid
     ))
  on conflict (registration_id, user_id) do nothing;

  get diagnostics v_added = row_count;

  return v_out || jsonb_build_object('roster_added', v_added);
end $$;

revoke all on function public.tournament_register_team(uuid, uuid, uuid, jsonb, jsonb, boolean, boolean)
  from public, anon;
grant execute on function public.tournament_register_team(uuid, uuid, uuid, jsonb, jsonb, boolean, boolean)
  to authenticated, service_role;

comment on function public.tournament_register_team is
  'KRA-035: a team entry and its roster in ONE transaction. The roster used to be bulk-inserted after '
  'the command returned, with the error discarded — producing duplicate captains, silently one-player '
  'entries, and (under D-35) points credited to the wrong people.';

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.team_roster_atomic_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- a person cannot be in an entry twice, by any path
    exists (
      select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'tournament_registration_players_unique'
    )
    -- and no entry currently violates it
    and not exists (
      select 1 from public.tournament_registration_players
       group by registration_id, user_id having count(*) > 1
    )
    -- the roster insert lives inside the command, not after it
    and (select position('jsonb_array_elements' in pg_get_functiondef(p.oid)) > 0
            and position('team_members tm' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'tournament_register_team' limit 1);
$$;

revoke all on function public.team_roster_atomic_intact() from public, anon, authenticated;
grant execute on function public.team_roster_atomic_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 39)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
