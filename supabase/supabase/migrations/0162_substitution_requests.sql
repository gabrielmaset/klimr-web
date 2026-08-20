-- 0162_substitution_requests.sql — consent-first roster substitutions.
--
-- A captain PROPOSES a swap; the roster changes only when the INCOMING player
-- ACCEPTS. Acceptance collects their per-player answers + waiver + rules and
-- executes the swap ATOMICALLY in accept_substitution() (SECURITY DEFINER),
-- which re-checks the roster-lock deadline AT THAT FINAL MOMENT — a request
-- created before the deadline can never sneak a swap in after it. Lifecycle:
-- pending → accepted | declined | cancelled | expired.
--
-- (1) tournament_substitution_requests + partial-unique guards: one pending
--     request per outgoing seat and per incoming player per tournament, so
--     multi-player substitutions are N independent requests that can't collide.
-- (2) RLS: visible to the four parties (requester, both players, staff);
--     direct UPDATE may only reach declined/cancelled/expired — 'accepted'
--     is unreachable except through the RPC, so a fake accept can't exist.
-- (3) accept_substitution(): the ONLY path to 'accepted'. Locks the request
--     row, re-validates deadline / entry / team membership / double-entry,
--     enforces required re-asked questions + waiver/rules, swaps the player
--     rows preserving is_reserve, stamps confirmation — one transaction.
-- (4) tournament_custom_fields.reask_on_substitution — the form-maker option:
--     per-player questions with this flag must be answered by a substitute
--     before accepting (default true; personal data never carries over).
-- (5) Rate wall: 30 requests per requester per day, DB-enforced.
-- Idempotent.

create table if not exists public.tournament_substitution_requests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  player_out uuid not null references public.profiles(id) on delete cascade,
  player_in uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  note text,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (player_out <> player_in)
);

create unique index if not exists tsr_one_pending_per_seat
  on public.tournament_substitution_requests (registration_id, player_out)
  where status = 'pending';
create unique index if not exists tsr_one_pending_per_incomer
  on public.tournament_substitution_requests (tournament_id, player_in)
  where status = 'pending';
create index if not exists tsr_incoming_idx
  on public.tournament_substitution_requests (player_in, status);
create index if not exists tsr_reg_idx
  on public.tournament_substitution_requests (registration_id, status);

alter table public.tournament_substitution_requests enable row level security;

drop policy if exists tsr_select on public.tournament_substitution_requests;
create policy tsr_select on public.tournament_substitution_requests for select
  using (
    requested_by = auth.uid() or player_in = auth.uid() or player_out = auth.uid()
    or exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid())
    or exists (select 1 from public.tournament_managers m where m.tournament_id = tournament_id and m.user_id = auth.uid())
  );

drop policy if exists tsr_insert on public.tournament_substitution_requests;
create policy tsr_insert on public.tournament_substitution_requests for insert
  with check (requested_by = auth.uid());

-- Direct updates can end a request, never fabricate an acceptance.
drop policy if exists tsr_update on public.tournament_substitution_requests;
create policy tsr_update on public.tournament_substitution_requests for update
  using (
    requested_by = auth.uid() or player_in = auth.uid()
    or exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid())
    or exists (select 1 from public.tournament_managers m where m.tournament_id = tournament_id and m.user_id = auth.uid())
  )
  with check (status in ('declined','cancelled','expired'));

create or replace function public.tsr_rate_guard() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.tournament_substitution_requests
        where requested_by = new.requested_by
          and created_at > now() - interval '1 day') >= 30 then
    raise exception 'substitution request rate limit';
  end if;
  return new;
end $$;
drop trigger if exists tsr_rate on public.tournament_substitution_requests;
create trigger tsr_rate before insert on public.tournament_substitution_requests
  for each row execute function public.tsr_rate_guard();

alter table public.tournament_custom_fields
  add column if not exists reask_on_substitution boolean not null default true;

-- The one and only path to an accepted substitution. Mirrors lib/tournament's
-- rosterLockAt() exactly: custom → roster_lock_custom; otherwise starts_at
-- minus {14d,7d,3d,24h,at_start} (unknown policy = at_start; no start = no lock).
create or replace function public.accept_substitution(
  p_request_id uuid,
  p_answers jsonb,
  p_accept_waiver boolean,
  p_accept_rules boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  t record;
  out_row record;
  lock_at timestamptz;
  legal jsonb;
  missing text;
begin
  select * into req from public.tournament_substitution_requests
    where id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Request not found.');
  end if;
  if req.player_in <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Only the invited substitute can accept.');
  end if;
  if req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'This request is no longer open.');
  end if;

  select id, status, starts_at, roster_lock_policy, roster_lock_custom, format_config
    into t from public.tournaments where id = req.tournament_id;
  if not found or t.status in ('completed','cancelled','archived') then
    update public.tournament_substitution_requests
       set status = 'expired', decided_at = now() where id = req.id;
    return jsonb_build_object('ok', false, 'error', 'This event is closed.');
  end if;

  -- DEADLINE AT THE FINAL MOMENT (recomputed live, not the snapshot — an
  -- organizer moving the policy after the request still governs the accept).
  if t.roster_lock_policy = 'custom' then
    lock_at := t.roster_lock_custom;
  elsif t.starts_at is null then
    lock_at := null;
  else
    lock_at := t.starts_at - case coalesce(t.roster_lock_policy, 'at_start')
      when '14d' then interval '14 days'
      when '7d'  then interval '7 days'
      when '3d'  then interval '3 days'
      when '24h' then interval '24 hours'
      else interval '0'
    end;
  end if;
  if lock_at is not null and now() > lock_at then
    update public.tournament_substitution_requests
       set status = 'expired', decided_at = now() where id = req.id;
    return jsonb_build_object('ok', false, 'error', 'The roster deadline for this event has passed.');
  end if;

  -- Entry still active?
  perform 1 from public.tournament_registrations r
    where r.id = req.registration_id
      and r.tournament_id = req.tournament_id
      and r.status not in ('withdrawn','declined','cancelled','disqualified');
  if not found then
    update public.tournament_substitution_requests
       set status = 'expired', decided_at = now() where id = req.id;
    return jsonb_build_object('ok', false, 'error', 'This entry is no longer active.');
  end if;

  -- Outgoing player still on the entry? (Lock their row for the swap.)
  select id, is_reserve into out_row
    from public.tournament_registration_players
    where registration_id = req.registration_id and user_id = req.player_out
    for update;
  if not found then
    update public.tournament_substitution_requests
       set status = 'expired', decided_at = now() where id = req.id;
    return jsonb_build_object('ok', false, 'error', 'That seat has already changed.');
  end if;

  -- Substitute must (still) be on the team roster for team entries.
  if req.team_id is not null then
    perform 1 from public.team_members
      where team_id = req.team_id and user_id = req.player_in;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'You are no longer on this team''s roster.');
    end if;
  end if;

  -- One entry per player per event.
  perform 1 from public.tournament_registration_players
    where tournament_id = req.tournament_id and user_id = req.player_in;
  if found then
    return jsonb_build_object('ok', false, 'error', 'You are already on an entry in this event.');
  end if;

  -- Required re-asked per-player questions must be answered.
  select f.label into missing
    from public.tournament_custom_fields f
    where f.tournament_id = req.tournament_id
      and f.scope = 'per_player'
      and f.required
      and f.reask_on_substitution
      and (
        p_answers is null
        or not (p_answers ? f.id::text)
        or btrim(coalesce(p_answers ->> f.id::text, '')) = ''
      )
    order by f.sort_order
    limit 1;
  if missing is not null then
    return jsonb_build_object('ok', false, 'error', 'Please answer: ' || missing);
  end if;

  -- Waiver / rules acceptance, exactly as first-time confirmation requires.
  legal := coalesce(t.format_config -> 'legal', '{}'::jsonb);
  if coalesce((legal ->> 'require_waiver')::boolean, false)
     and btrim(coalesce(legal ->> 'waiver_text', '')) <> ''
     and not coalesce(p_accept_waiver, false) then
    return jsonb_build_object('ok', false, 'error', 'Please accept the waiver to continue.');
  end if;
  if coalesce((legal ->> 'require_rules')::boolean, false)
     and btrim(coalesce(legal ->> 'rules_text', '')) <> ''
     and not coalesce(p_accept_rules, false) then
    return jsonb_build_object('ok', false, 'error', 'Please acknowledge the rules to continue.');
  end if;

  -- The atomic swap: seat preserved (is_reserve), confirmation stamped now.
  delete from public.tournament_registration_players where id = out_row.id;
  insert into public.tournament_registration_players
    (registration_id, tournament_id, user_id, is_reserve, confirmed_at,
     waiver_accepted_at, waiver_version, rules_accepted_at, rules_version, player_answers)
  values
    (req.registration_id, req.tournament_id, req.player_in, out_row.is_reserve, now(),
     case when coalesce(p_accept_waiver, false) then now() end,
     case when coalesce(p_accept_waiver, false) then '1' end,
     case when coalesce(p_accept_rules, false) then now() end,
     case when coalesce(p_accept_rules, false) then '1' end,
     coalesce(p_answers, '{}'::jsonb));

  update public.tournament_substitution_requests
     set status = 'accepted', decided_at = now()
   where id = req.id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.accept_substitution(uuid, jsonb, boolean, boolean) from public;
grant execute on function public.accept_substitution(uuid, jsonb, boolean, boolean) to authenticated;
