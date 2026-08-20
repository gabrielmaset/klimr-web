-- 0294_bracket_graph_generation.sql — the graph is born whole, or not at all.
--
-- KCDX-046 residual, the piece 0222 recorded as outstanding rather than
-- half-building: draw creation, round linking and bye advancement ran as
-- application loops. Reproduced by execution on 2026-08-18 against the real
-- commands before this file existed:
--   * buildBracketFromSeeds OPENS with an unconditional delete of every
--     knockout match in the division — a completed match with a recorded
--     score was erased by regeneration's first statement (R1);
--   * the next-link wiring ran as one UPDATE per match with every result
--     discarded — and tournament_score_match on a null-linked match returned
--     ok:true while the semi-final's entries stayed NULL/NULL: the winner
--     advanced nowhere, through the command's own front door (R2);
--   * tournament_draws had no uniqueness on (division_id, draw_number) — two
--     rows with draw_number 1 were accepted, so the app's count-then-insert
--     numbering races into duplicate history (R3).
--
-- WHAT THIS DOES. Generation becomes three commands under the tournament lock,
-- with 0222's refusal doctrine composed in: regenerating over PLAYED matches is
-- an adjudication, so the commands refuse and say so instead of erasing
-- results. The knockout graph — rows, byes, bye advancement, and every
-- next-link — is written set-based inside one transaction and asserted
-- complete before it commits (matches = size - 1; zero missing links). Pool
-- generation and pool clearing get the same lock, auth and refusal. Draw
-- numbers are minted under the lock and a UNIQUE index makes the duplicate
-- structurally impossible. bracket_graph_intact() is AMENDED — 0222's body
-- carried forward bye-corrected, plus link and uniqueness clauses: a
-- half-wired graph turns readiness red instead of swallowing winners.

begin;

-- R3's structural fix. Production holds zero rows (2026-08-18 wipe); the
-- harness reproduction rolled back, so this creates cleanly everywhere.
create unique index if not exists tournament_draws_division_number_unique
  on public.tournament_draws (division_id, draw_number);

-- ── knockout generation ────────────────────────────────────────────────────
create or replace function public.tournament_generate_bracket(
  p_tournament uuid,
  p_division   uuid,
  p_seats      uuid[]   -- bracket positions in order; null = bye seat
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_t       record;
  v_size    int := coalesce(array_length(p_seats, 1), 0);
  v_n       int;
  v_rounds  int := 0;
  v_i       int;
  v_bad     uuid;
  v_played  int;
  v_matches int;
  v_byes    int;
  v_links   int;
  v_draw    int;
begin
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (public.is_privileged_writer() or public.is_tournament_staff(p_tournament)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from public.tournament_divisions
                  where id = p_division and tournament_id = p_tournament) then
    return jsonb_build_object('ok', false, 'error', 'bad_division');
  end if;

  -- exact-reject validation (the WP-I doctrine: reasons, loudly, before writes)
  if v_size < 2 or (v_size & (v_size - 1)) <> 0 then
    raise exception 'seats_not_power_of_two: %', v_size using errcode = 'P0001';
  end if;
  select count(*) into v_n from unnest(p_seats) s where s is not null;
  if v_n < 2 then
    raise exception 'seats_too_few: %', v_n using errcode = 'P0001';
  end if;
  select s into v_bad from unnest(p_seats) s where s is not null
   group by s having count(*) > 1 limit 1;
  if v_bad is not null then
    raise exception 'seat_duplicate: %', v_bad using errcode = 'P0001';
  end if;
  select s into v_bad from unnest(p_seats) s
   where s is not null
     and not exists (
       select 1 from public.tournament_registrations r
        where r.id = s and r.tournament_id = p_tournament and r.division_id = p_division
          and r.status not in ('withdrawn','declined','cancelled','disqualified'))
   limit 1;
  if v_bad is not null then
    raise exception 'seat_not_registered: %', v_bad using errcode = 'P0001';
  end if;

  -- 0222's doctrine, composed: a regeneration that would erase played matches
  -- is an adjudication. Refuse and say so. (A bye is completed with one null
  -- entry — that is structure, not play.)
  select count(*) into v_played
    from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is null
     and (score_a is not null or score_b is not null
          or (winner_id is not null and entry_a is not null and entry_b is not null));
  if v_played > 0 then
    return jsonb_build_object('ok', false, 'error', 'bracket_played',
      'detail', v_played || ' played match(es) would be erased. Correcting a played bracket is an adjudication — clear the results first, deliberately.');
  end if;

  delete from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is null;

  v_i := v_size;
  while v_i > 1 loop v_rounds := v_rounds + 1; v_i := v_i / 2; end loop;

  -- round 1: seats in, byes completed with their winner, in ONE statement
  insert into public.tournament_matches
    (tournament_id, division_id, group_id, bracket, round, slot,
     entry_a, entry_b, status, winner_id, sort_order)
  select p_tournament, p_division, null, 'main', 1, s.i - 1,
         s.a, s.b,
         case when (s.a is null) <> (s.b is null) then 'completed' else 'pending' end,
         case when s.a is not null and s.b is null then s.a
              when s.b is not null and s.a is null then s.b end,
         s.i - 1
    from (select gs as i, p_seats[2 * gs - 1] as a, p_seats[2 * gs] as b
            from generate_series(1, v_size / 2) gs) s;

  -- rounds 2..R: empty shells, one statement
  insert into public.tournament_matches
    (tournament_id, division_id, group_id, bracket, round, slot,
     entry_a, entry_b, status, sort_order)
  select p_tournament, p_division, null, 'main', r, sl - 1,
         null, null, 'pending', (r - 1) * 1000 + (sl - 1)
    from generate_series(2, v_rounds) r
   cross join lateral generate_series(1, (v_size / power(2, r))::int) sl;

  -- every advancement link, one statement
  update public.tournament_matches m
     set next_match_id = n.id,
         next_slot = case when m.slot % 2 = 0 then 'a' else 'b' end
    from public.tournament_matches n
   where m.tournament_id = p_tournament and m.division_id = p_division
     and m.group_id is null and m.bracket = 'main' and m.round < v_rounds
     and n.tournament_id = p_tournament and n.division_id = p_division
     and n.group_id is null and n.bracket = 'main'
     and n.round = m.round + 1 and n.slot = m.slot / 2;

  -- bye winners advance into round 2 — aggregated per target so two byes
  -- feeding one match both land (UPDATE ... FROM with duplicate join rows is
  -- nondeterministic; the aggregate is not).
  update public.tournament_matches n
     set entry_a = coalesce(w.wa, n.entry_a),
         entry_b = coalesce(w.wb, n.entry_b)
    from (select f.next_match_id as nid,
                 (array_agg(f.winner_id) filter (where f.slot % 2 = 0))[1] as wa,
                 (array_agg(f.winner_id) filter (where f.slot % 2 = 1))[1] as wb
            from public.tournament_matches f
           where f.tournament_id = p_tournament and f.division_id = p_division
             and f.group_id is null and f.round = 1 and f.status = 'completed'
           group by 1) w
   where n.id = w.nid;

  -- the graph proves itself before it commits
  select count(*),
         count(*) filter (where round = 1 and status = 'completed')
    into v_matches, v_byes
    from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is null;
  if v_matches <> v_size - 1 then
    raise exception 'graph_incomplete: % matches for size %', v_matches, v_size
      using errcode = 'P0001';
  end if;
  select count(*) into v_links
    from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is null
     and round < v_rounds and next_match_id is null;
  if v_links <> 0 then
    raise exception 'links_incomplete: % unlinked', v_links using errcode = 'P0001';
  end if;

  insert into public.tournament_draws (tournament_id, division_id, draw_number, drawn_by)
  values (p_tournament, p_division,
          (select coalesce(max(draw_number), 0) + 1
             from public.tournament_draws where division_id = p_division),
          v_me)
  returning draw_number into v_draw;

  return jsonb_build_object('ok', true, 'matches', v_matches, 'rounds', v_rounds,
                            'byes', v_byes, 'draw_number', v_draw);
end $$;

revoke all on function public.tournament_generate_bracket(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.tournament_generate_bracket(uuid, uuid, uuid[]) to authenticated, service_role;

comment on function public.tournament_generate_bracket is
  'KCDX-046: the knockout graph — rows, byes, bye advancement, every next-link — written set-based '
  'in one transaction under the tournament lock, asserted complete (size-1 matches, zero missing '
  'links) before commit. Refuses to regenerate over played matches: that is an adjudication. Mints '
  'draw_number under the same lock; uniqueness enforced by index.';

-- ── pool generation ────────────────────────────────────────────────────────
create or replace function public.tournament_generate_pools(
  p_tournament uuid,
  p_division   uuid,
  p_groups     jsonb   -- [{name, sort, entries:[{registration_id, seed}]}]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_t       record;
  v_bad     uuid;
  v_played  int;
  v_g       record;
  v_gid     uuid;
  v_so      int := 0;
  v_n       int;
  v_groups  int := 0;
  v_entries int := 0;
  v_matches int := 0;
  v_draw    int;
begin
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (public.is_privileged_writer() or public.is_tournament_staff(p_tournament)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from public.tournament_divisions
                  where id = p_division and tournament_id = p_tournament) then
    return jsonb_build_object('ok', false, 'error', 'bad_division');
  end if;
  if jsonb_typeof(coalesce(p_groups, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_groups, '[]'::jsonb)) = 0 then
    raise exception 'pools_empty' using errcode = 'P0001';
  end if;

  -- exact-reject: every listed entry is a live registration here, listed once
  select (e ->> 'registration_id')::uuid into v_bad
    from jsonb_array_elements(p_groups) g,
         jsonb_array_elements(g -> 'entries') e
   group by 1 having count(*) > 1 limit 1;
  if v_bad is not null then
    raise exception 'pool_entry_duplicate: %', v_bad using errcode = 'P0001';
  end if;
  select (e ->> 'registration_id')::uuid into v_bad
    from jsonb_array_elements(p_groups) g,
         jsonb_array_elements(g -> 'entries') e
   where not exists (
     select 1 from public.tournament_registrations r
      where r.id = (e ->> 'registration_id')::uuid
        and r.tournament_id = p_tournament and r.division_id = p_division
        and r.status not in ('withdrawn','declined','cancelled','disqualified'))
   limit 1;
  if v_bad is not null then
    raise exception 'pool_entry_not_registered: %', v_bad using errcode = 'P0001';
  end if;

  select count(*) into v_played
    from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is not null
     and (score_a is not null or score_b is not null or winner_id is not null);
  if v_played > 0 then
    return jsonb_build_object('ok', false, 'error', 'pools_played',
      'detail', v_played || ' played pool match(es) would be erased. Clear results deliberately first.');
  end if;

  delete from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is not null;
  delete from public.tournament_group_entries
   where group_id in (select id from public.tournament_groups
                       where tournament_id = p_tournament and division_id = p_division);
  delete from public.tournament_groups
   where tournament_id = p_tournament and division_id = p_division;

  -- groups are few (a handful of pools); entries and matches per group are
  -- written set-based inside the loop.
  for v_g in
    select g ->> 'name' as name,
           coalesce((g ->> 'sort')::int, ord::int) as sort,
           g -> 'entries' as entries
      from jsonb_array_elements(p_groups) with ordinality as t(g, ord)
     order by 2
  loop
    insert into public.tournament_groups (tournament_id, division_id, name, sort_order)
    values (p_tournament, p_division, v_g.name, v_g.sort)
    returning id into v_gid;
    v_groups := v_groups + 1;

    insert into public.tournament_group_entries
      (group_id, tournament_id, division_id, registration_id, seed, sort_order)
    select v_gid, p_tournament, p_division,
           (e ->> 'registration_id')::uuid,
           coalesce((e ->> 'seed')::int, ord::int),
           ord::int - 1
      from jsonb_array_elements(v_g.entries) with ordinality as t(e, ord);
    get diagnostics v_n = row_count; v_entries := v_entries + v_n;

    insert into public.tournament_matches
      (tournament_id, division_id, group_id, round, slot, entry_a, entry_b, status, sort_order)
    select p_tournament, p_division, v_gid, 0, 0,
           (a.e ->> 'registration_id')::uuid, (b.e ->> 'registration_id')::uuid,
           'pending', v_so + row_number() over (order by a.ord, b.ord) - 1
      from jsonb_array_elements(v_g.entries) with ordinality as a(e, ord)
      join jsonb_array_elements(v_g.entries) with ordinality as b(e, ord)
        on a.ord < b.ord;
    get diagnostics v_n = row_count;
    v_so := v_so + v_n; v_matches := v_matches + v_n;
  end loop;

  insert into public.tournament_draws (tournament_id, division_id, draw_number, drawn_by)
  values (p_tournament, p_division,
          (select coalesce(max(draw_number), 0) + 1
             from public.tournament_draws where division_id = p_division),
          v_me)
  returning draw_number into v_draw;

  return jsonb_build_object('ok', true, 'groups', v_groups, 'entries', v_entries,
                            'matches', v_matches, 'draw_number', v_draw);
end $$;

revoke all on function public.tournament_generate_pools(uuid, uuid, jsonb) from public, anon;
grant execute on function public.tournament_generate_pools(uuid, uuid, jsonb) to authenticated, service_role;

comment on function public.tournament_generate_pools is
  'KCDX-046: pool groups, entries and the full round-robin schedule in one transaction under the '
  'tournament lock, with exact-reject validation and refusal over played pool matches. Draw logged '
  'atomically under the same lock.';

-- ── pool clearing (the second app site) ────────────────────────────────────
create or replace function public.tournament_clear_pools(
  p_tournament uuid,
  p_division   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record; v_played int; v_matches int; v_groups int;
begin
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (public.is_privileged_writer() or public.is_tournament_staff(p_tournament)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select count(*) into v_played
    from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is not null
     and (score_a is not null or score_b is not null or winner_id is not null);
  if v_played > 0 then
    return jsonb_build_object('ok', false, 'error', 'pools_played',
      'detail', v_played || ' played pool match(es) would be erased.');
  end if;
  delete from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is not null;
  get diagnostics v_matches = row_count;
  delete from public.tournament_group_entries
   where group_id in (select id from public.tournament_groups
                       where tournament_id = p_tournament and division_id = p_division);
  delete from public.tournament_groups
   where tournament_id = p_tournament and division_id = p_division;
  get diagnostics v_groups = row_count;
  return jsonb_build_object('ok', true, 'matches_removed', v_matches, 'groups_removed', v_groups);
end $$;

revoke all on function public.tournament_clear_pools(uuid, uuid) from public, anon;
grant execute on function public.tournament_clear_pools(uuid, uuid) to authenticated, service_role;

comment on function public.tournament_clear_pools is
  'KCDX-046: pool clearing under the tournament lock with the same played-match refusal — clearing '
  'over played matches is an adjudication, not a reset.';

-- ── knockout clearing (the fourth app surface, found by the tripwire) ──────
create or replace function public.tournament_clear_bracket(
  p_tournament uuid,
  p_division   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record; v_played int; v_matches int;
begin
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (public.is_privileged_writer() or public.is_tournament_staff(p_tournament)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select count(*) into v_played
    from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is null
     and (score_a is not null or score_b is not null
          or (winner_id is not null and entry_a is not null and entry_b is not null));
  if v_played > 0 then
    return jsonb_build_object('ok', false, 'error', 'bracket_played',
      'detail', v_played || ' played match(es) would be erased.');
  end if;
  delete from public.tournament_matches
   where tournament_id = p_tournament and division_id = p_division and group_id is null;
  get diagnostics v_matches = row_count;
  return jsonb_build_object('ok', true, 'matches_removed', v_matches);
end $$;

revoke all on function public.tournament_clear_bracket(uuid, uuid) from public, anon;
grant execute on function public.tournament_clear_bracket(uuid, uuid) to authenticated, service_role;

comment on function public.tournament_clear_bracket is
  'KCDX-046: knockout clearing under the tournament lock with the played-match refusal — byes '
  '(completed, one side, winner = that side) are structure and clear freely; a played result does not.';

-- ── sentinel ───────────────────────────────────────────────────────────────
-- bracket_graph_intact EXISTS since 0222 (rollback-past-played detector). This
-- is an AMENDMENT, not an addition — the readiness count stays 43, and the
-- count-floor gate is what caught the first draft of this file replacing the
-- 0222 body without carrying its assertion forward. 0222's clause is preserved
-- in corrected form: as written it flagged every legitimate bye (completed,
-- one null side, winner set — the generator's own output); the true
-- incoherence signature is a winner sitting in NEITHER slot.
create or replace function public.bracket_graph_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- 0222's intent, bye-corrected: a completed match whose winner is in
    -- neither slot is the signature of a rollback that reached past played
    -- matches. A bye passes: its winner IS its one present entry.
    not exists (
      select 1 from public.tournament_matches
       where status = 'completed' and winner_id is not null
         and winner_id is distinct from entry_a
         and winner_id is distinct from entry_b
    )
    -- and a completed match with BOTH sides empty is hollow
    and not exists (
      select 1 from public.tournament_matches
       where status = 'completed' and entry_a is null and entry_b is null
    )
    -- 0294: no non-final knockout match is missing its advancement link
    and not exists (
      select 1 from public.tournament_matches m
       where m.group_id is null and m.next_match_id is null
         and m.round < (select max(x.round) from public.tournament_matches x
                         where x.tournament_id = m.tournament_id
                           and x.division_id is not distinct from m.division_id
                           and x.group_id is null and x.bracket = m.bracket)
    )
    -- 0294: every link lands exactly one round up, at floor(slot/2), in scope
    and not exists (
      select 1 from public.tournament_matches m
        join public.tournament_matches n on n.id = m.next_match_id
       where m.group_id is null
         and (n.round <> m.round + 1
              or n.slot <> m.slot / 2
              or n.tournament_id <> m.tournament_id
              or n.division_id is distinct from m.division_id)
    )
    -- 0294: the draw history cannot hold duplicate numbers
    and exists (
      select 1 from pg_indexes
       where schemaname = 'public' and tablename = 'tournament_draws'
         and indexname = 'tournament_draws_division_number_unique'
    );
$$;

revoke all on function public.bracket_graph_intact() from public, anon, authenticated;
grant execute on function public.bracket_graph_intact() to service_role;

comment on function public.bracket_graph_intact is
  'KCDX-046, amending 0222: a completed match whose winner sits in neither slot (0222''s '
  'rollback-past-played intent, corrected so legitimate byes pass), a hollow completed match, a '
  'half-wired knockout graph, a misdirected link, or missing draw-number uniqueness turns readiness '
  'red. Readiness count unchanged: this replaces the 0222 body, assertions carried forward.';

select public.journal_migration('0294', '0294_bracket_graph_generation.sql', null,
  'KCDX-046 residual: graph generation becomes four commands under the tournament lock — tournament_generate_bracket (set-based rows, byes, bye advancement and every next-link in one transaction, self-asserted complete before commit), tournament_generate_pools, tournament_clear_pools, tournament_clear_bracket — all refusing over played matches (0222''s adjudication doctrine composed). Unique index on tournament_draws(division_id, draw_number) closes the numbering race. bracket_graph_intact AMENDED (0222 body carried forward, bye-corrected — its clause as written flagged every legitimate bye and had passed only vacuously); readiness count unchanged at 43. All three defects (played-history erasure, swallowed winner via null next-link through tournament_score_match, duplicate draw numbers) were reproduced by execution before this fix.');

commit;
