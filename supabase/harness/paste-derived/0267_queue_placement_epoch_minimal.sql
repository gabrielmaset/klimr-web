create or replace function public.place_on_team(
  p_court_id        uuid,
  p_user_id         uuid,
  p_guest_name      text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size    int;
  v_session uuid;
  v_target  uuid;
  v_count   int;
  v_prior   uuid;
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('qcmd:' || p_idempotency_key, 0));
    v_prior := (select result_team_id
                  from public.queue_command_log
                 where idempotency_key = p_idempotency_key);
    if v_prior is not null and exists (
      select 1
        from public.queue_teams t
        join public.queue_team_members m on m.team_id = t.id
       where t.id = v_prior
         and t.status <> 'done'
         and ((p_user_id is not null and m.user_id = p_user_id)
           or (p_user_id is null and m.guest_name = p_guest_name))
    ) then
      return v_prior;
    end if;
  end if;

  v_size := (select team_size from public.queue_courts where id = p_court_id);
  v_session := (select session_id from public.queue_courts where id = p_court_id);
  if v_session is null then
    raise exception 'queue_court_not_found' using errcode = 'P0002';
  end if;

  if p_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('qsess:' || v_session::text || ':' || p_user_id::text, 0));
    if exists (
      select 1
        from public.queue_team_members m
        join public.queue_teams t on t.id = m.team_id
       where m.user_id = p_user_id
         and t.session_id = v_session
         and t.status <> 'done'
    ) then
      raise exception 'already_in_session' using errcode = 'P0001';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));

  v_target := (
    select t.id
      from public.queue_teams t
     where t.court_id = p_court_id
       and t.status = 'forming'
       and (select count(*) from public.queue_team_members m where m.team_id = t.id) < v_size
     order by t.created_at
     limit 1
  );

  if v_target is null then
    v_target := gen_random_uuid();
    insert into public.queue_teams (id, session_id, court_id, status)
    values (v_target, v_session, p_court_id, 'forming');
    v_count := 0;
  else
    v_count := (select count(*) from public.queue_team_members m where m.team_id = v_target);
  end if;

  insert into public.queue_team_members (team_id, user_id, guest_name, session_id)
  values (v_target, p_user_id, p_guest_name, v_session);

  if v_count + 1 >= v_size then
    update public.queue_teams
      set status = 'queued', queued_at = now(), hold_court = false
      where id = v_target and status = 'forming';
  end if;

  if p_idempotency_key is not null then
    insert into public.queue_command_log
      (idempotency_key, session_id, court_id, command, result_team_id, actor_user_id)
    values (p_idempotency_key, v_session, p_court_id, 'place_on_team', v_target, p_user_id)
    on conflict (idempotency_key) do update
      set result_team_id = excluded.result_team_id,
          session_id     = excluded.session_id,
          court_id       = excluded.court_id,
          created_at     = now();
  end if;

  return v_target;
end;
$$;

revoke all on function public.place_on_team(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.place_on_team(uuid, uuid, text, text) to service_role;

create or replace function public.queue_join_full_team(
  p_court_id        uuid,
  p_names           text[],
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size    int;
  v_session uuid;
  v_closed  timestamptz;
  v_allow   boolean;
  v_status  text;
  v_team    uuid;
  v_prior   uuid;
  v_names   text[];
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('qcmd:' || p_idempotency_key, 0));
    v_prior := (select result_team_id
                  from public.queue_command_log
                 where idempotency_key = p_idempotency_key);
    if v_prior is not null and exists (
      select 1 from public.queue_teams t where t.id = v_prior and t.status <> 'done'
    ) then
      return v_prior;
    end if;
  end if;

  v_size := (select c.team_size from public.queue_courts c where c.id = p_court_id);
  v_session := (select c.session_id from public.queue_courts c where c.id = p_court_id);
  v_closed := (select c.closed_at from public.queue_courts c where c.id = p_court_id);
  if v_session is null then
    raise exception 'queue_court_not_found' using errcode = 'P0002';
  end if;
  if v_closed is not null then
    raise exception 'court_closed' using errcode = 'P0001';
  end if;

  v_allow := (select s.allow_full_teams from public.court_sessions s where s.id = v_session);
  v_status := (select s.status from public.court_sessions s where s.id = v_session);
  if v_status = 'ended' then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;
  if not coalesce(v_allow, false) then
    raise exception 'full_teams_disabled' using errcode = 'P0001';
  end if;

  v_names := (select array_agg(btrim(n)) from unnest(p_names) as n);
  if v_names is null
     or array_length(v_names, 1) is distinct from v_size
     or exists (select 1 from unnest(v_names) as n where length(n) < 1 or length(n) > 16) then
    raise exception 'bad_team_names' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));

  v_team := gen_random_uuid();
  insert into public.queue_teams (id, session_id, court_id, status, queued_at, hold_court)
  values (v_team, v_session, p_court_id, 'queued', now(), false);

  insert into public.queue_team_members (team_id, guest_name, session_id)
  select v_team, n, v_session from unnest(v_names) as n;

  if p_idempotency_key is not null then
    insert into public.queue_command_log
      (idempotency_key, session_id, court_id, command, result_team_id, actor_user_id)
    values (p_idempotency_key, v_session, p_court_id, 'queue_join_full_team', v_team, null)
    on conflict (idempotency_key) do update
      set result_team_id = excluded.result_team_id,
          session_id     = excluded.session_id,
          court_id       = excluded.court_id,
          created_at     = now();
  end if;

  return v_team;
end;
$$;

revoke all on function public.queue_join_full_team(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.queue_join_full_team(uuid, text[], text) to service_role;

select public.journal_migration('0267', '0267_queue_placement_epoch.sql', null,
  'KRA-037: idempotency epoch derived from live placement state, plus the atomic queue_join_full_team command.');
