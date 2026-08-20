-- terminal_immutability_suite.sql — KFU-013 / KFU-010 closure control.
-- A finished result must be unchangeable except through a recorded correction,
-- and a meetup between two strangers must not be able to change who is meeting
-- whom or jump states.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-0000000000a1','ti-home@test.local'),
  ('da000000-0000-0000-0000-0000000000a2','ti-away@test.local'),
  ('da000000-0000-0000-0000-0000000000a3','ti-buyer@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, date_of_birth) values
  ('da000000-0000-0000-0000-0000000000a1','TI Home','1990-01-01'),
  ('da000000-0000-0000-0000-0000000000a2','TI Away','1990-01-01'),
  ('da000000-0000-0000-0000-0000000000a3','TI Buyer','1990-01-01')
on conflict (id) do update set display_name = excluded.display_name, date_of_birth = excluded.date_of_birth;
insert into public.sports (key, name, skill_system) values ('ti-sport','TI Sport','Level')
on conflict (key) do nothing;
insert into public.teams (id, name, sport_key, created_by, max_size, join_policy) values
  ('da000000-0000-0000-0000-0000000000b1','TI Home Team','ti-sport','da000000-0000-0000-0000-0000000000a1',8,'open'),
  ('da000000-0000-0000-0000-0000000000b2','TI Away Team','ti-sport','da000000-0000-0000-0000-0000000000a2',8,'open')
on conflict (id) do nothing;
insert into public.team_members (team_id, user_id, role) values
  ('da000000-0000-0000-0000-0000000000b1','da000000-0000-0000-0000-0000000000a1','owner'),
  ('da000000-0000-0000-0000-0000000000b2','da000000-0000-0000-0000-0000000000a2','owner')
on conflict do nothing;
insert into public.team_matches (id, sport_key, home_team_id, away_team_id, proposed_by, status, home_score, away_score, winner_team_id)
values ('da000000-0000-0000-0000-0000000000c1','ti-sport',
        'da000000-0000-0000-0000-0000000000b1','da000000-0000-0000-0000-0000000000b2',
        'da000000-0000-0000-0000-0000000000a1','completed', 6, 4, 'da000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

-- ── KFU-013: a completed result cannot be edited ────────────────────────────
do $$
begin
  begin
    update public.team_matches set home_score = 99
     where id = 'da000000-0000-0000-0000-0000000000c1';
    raise exception 'TI-FAIL a completed score was rewritten';
  exception when others then
    if sqlerrm <> 'result_is_final' then raise; end if;
  end;
end $$;
select 'ok   TI a completed score cannot be rewritten by direct update';

do $$
begin
  begin
    update public.team_matches set winner_team_id = 'da000000-0000-0000-0000-0000000000b2'
     where id = 'da000000-0000-0000-0000-0000000000c1';
    raise exception 'TI-FAIL the winner of a completed match was changed';
  exception when others then
    if sqlerrm <> 'result_is_final' then raise; end if;
  end;
end $$;
select 'ok   TI the winner of a completed match cannot be changed by direct update';

do $$
begin
  begin
    update public.team_matches set status = 'scheduled'
     where id = 'da000000-0000-0000-0000-0000000000c1';
    raise exception 'TI-FAIL a completed match was reopened';
  exception when others then
    if sqlerrm <> 'result_is_final' then raise; end if;
  end;
end $$;
select 'ok   TI a completed match cannot be reopened';

-- ── the correction command is the only route, and it records ────────────────
select set_config('request.jwt.claim.sub','da000000-0000-0000-0000-0000000000a3',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
begin
  begin
    perform public.team_match_correct_result('da000000-0000-0000-0000-0000000000c1', 7, 5, null, 'not my match');
    raise exception 'TI-FAIL a non-manager corrected a result';
  exception when others then
    if sqlerrm <> 'not_a_manager' then raise; end if;
  end;
end $$;
select 'ok   TI a non-manager cannot correct a result';
reset role;

select set_config('request.jwt.claim.sub','da000000-0000-0000-0000-0000000000a1',true);
set local role authenticated;
do $$
begin
  begin
    perform public.team_match_correct_result('da000000-0000-0000-0000-0000000000c1', 7, 5, null, '   ');
    raise exception 'TI-FAIL a correction was accepted without a reason';
  exception when others then
    if sqlerrm <> 'reason_required' then raise; end if;
  end;
end $$;
select 'ok   TI a correction requires a stated reason';

select public.team_match_correct_result('da000000-0000-0000-0000-0000000000c1', 7, 5,
        'da000000-0000-0000-0000-0000000000b1', 'scoresheet transcription error');
reset role;
select case when (select home_score from public.team_matches where id='da000000-0000-0000-0000-0000000000c1') = 7
  then 'ok   TI BASELINE the correction command CAN change a finished result (freeze is not a wall)'
  else 'TI-FAIL the correction did not apply' end;
select case when (select count(*) from public.team_match_result_corrections
                   where match_id='da000000-0000-0000-0000-0000000000c1'
                     and before_home = 6 and after_home = 7 and reason <> '') = 1
  then 'ok   TI the correction recorded before, after and the reason'
  else 'TI-FAIL the correction left no usable audit row' end;

-- the unlock does not leak past the command
do $$
begin
  begin
    update public.team_matches set home_score = 42
     where id = 'da000000-0000-0000-0000-0000000000c1';
    raise exception 'TI-FAIL the correction unlock leaked to later statements';
  exception when others then
    if sqlerrm <> 'result_is_final' then raise; end if;
  end;
end $$;
select 'ok   TI the transaction-local unlock does not leak to later writes';

-- ── KFU-010: the meetup state machine ───────────────────────────────────────
insert into public.marketplace_listings (id, kind, listed_by, title, price_cents, status, sport_key)
values ('da000000-0000-0000-0000-0000000000d1','gear','da000000-0000-0000-0000-0000000000a1','TI Racket', 5000, 'active','ti-sport')
on conflict (id) do nothing;

-- The third party proposes AS THEMSELVES, so the refusal proves the counterparty
-- rule rather than the proposer-identity rule (both exist; this tests the one it
-- claims to).
select set_config('request.jwt.claim.sub','da000000-0000-0000-0000-0000000000a2',true);
do $$
begin
  begin
    insert into public.listing_meetups (listing_id, proposed_by, buyer_id, starts_at, status)
    values ('da000000-0000-0000-0000-0000000000d1','da000000-0000-0000-0000-0000000000a2',
            'da000000-0000-0000-0000-0000000000a3', now() + interval '1 day', 'proposed');
    raise exception 'TI-FAIL a third party arranged a meeting between two other people';
  exception when others then
    if sqlerrm <> 'not_a_counterparty' then raise; end if;
  end;
end $$;
select 'ok   TI a third party cannot arrange a meetup between two other people';

-- someone spoofing another person as the proposer is refused too
do $$
begin
  begin
    insert into public.listing_meetups (listing_id, proposed_by, buyer_id, starts_at, status)
    values ('da000000-0000-0000-0000-0000000000d1','da000000-0000-0000-0000-0000000000a1',
            'da000000-0000-0000-0000-0000000000a3', now() + interval '1 day', 'proposed');
    raise exception 'TI-FAIL a caller proposed a meetup in someone else''s name';
  exception when others then
    if sqlerrm <> 'proposer_must_be_caller' then raise; end if;
  end;
end $$;
select 'ok   TI a caller cannot propose a meetup in someone else''s name';

select set_config('request.jwt.claim.sub','da000000-0000-0000-0000-0000000000a1',true);

do $$
begin
  begin
    insert into public.listing_meetups (listing_id, proposed_by, buyer_id, starts_at, status)
    values ('da000000-0000-0000-0000-0000000000d1','da000000-0000-0000-0000-0000000000a1',
            'da000000-0000-0000-0000-0000000000a3', now() + interval '1 day', 'accepted');
    raise exception 'TI-FAIL a meetup was created already accepted';
  exception when others then
    if sqlerrm <> 'meetups_start_proposed' then raise; end if;
  end;
end $$;
select 'ok   TI a meetup cannot be created already accepted';

insert into public.listing_meetups (id, listing_id, proposed_by, buyer_id, starts_at, status)
values ('da000000-0000-0000-0000-0000000000e1','da000000-0000-0000-0000-0000000000d1',
        'da000000-0000-0000-0000-0000000000a1','da000000-0000-0000-0000-0000000000a3',
        now() + interval '1 day', 'proposed');
select 'ok   TI BASELINE a counterparty can propose a meetup';

do $$
begin
  begin
    update public.listing_meetups set buyer_id = 'da000000-0000-0000-0000-0000000000a2'
     where id = 'da000000-0000-0000-0000-0000000000e1';
    raise exception 'TI-FAIL the counterparty was swapped after the proposal';
  exception when others then
    if sqlerrm <> 'meetup_identities_frozen' then raise; end if;
  end;
end $$;
select 'ok   TI who is meeting whom is frozen after the proposal';

update public.listing_meetups set status = 'accepted' where id = 'da000000-0000-0000-0000-0000000000e1';
select 'ok   TI BASELINE the legitimate path proposed to accepted works';

update public.listing_meetups set status = 'cancelled' where id = 'da000000-0000-0000-0000-0000000000e1';
select 'ok   TI an agreed meeting can still be cancelled';

do $$
begin
  begin
    update public.listing_meetups set status = 'accepted'
     where id = 'da000000-0000-0000-0000-0000000000e1';
    raise exception 'TI-FAIL a cancelled meetup was revived';
  exception when others then
    if sqlerrm <> 'bad_meetup_transition' then raise; end if;
  end;
end $$;
select 'ok   TI a cancelled meetup is terminal and cannot be revived';

rollback;
