-- suspension_gate_suite.sql — KFU-028 closure control.
-- The audit's required test: a member signs in, keeps their token, gets
-- suspended, and then attempts direct writes. Every disallowed write must fail
-- — not because the app hid a button, but because the database refused.
-- Also proves the fail-closed direction (unknown profile = denied) and that
-- service/definer paths still work on a suspended member's rows (moderation
-- must not be locked out by its own suspension).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-0000000000e1','susp-active@test.local'),
  ('dd000000-0000-0000-0000-0000000000e2','susp-target@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, account_status) values
  ('dd000000-0000-0000-0000-0000000000e1','Susp Active','active'),
  ('dd000000-0000-0000-0000-0000000000e2','Susp Target','active')
on conflict (id) do update set display_name = excluded.display_name, account_status = excluded.account_status;

-- ── baseline: an ACTIVE member can write (non-zero baseline; without this the
--    suite could pass by measuring nothing) ─────────────────────────────────
select set_config('request.jwt.claim.sub','dd000000-0000-0000-0000-0000000000e2',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into public.posts (id, author_id, body) values
  ('dd000000-0000-0000-0000-0000000000f1','dd000000-0000-0000-0000-0000000000e2','baseline post');
select case when exists (select 1 from public.posts where id = 'dd000000-0000-0000-0000-0000000000f1')
  then 'ok   SUSP baseline: an active member CAN post (test measures something)'
  else 'SUSP-FAIL baseline post did not land' end;
reset role;

-- ── suspend the member (service path) ────────────────────────────────────────
-- NOTE: 0008's guard_account_status silently REVERTS a status change unless the
-- caller is service_role. Moderation runs as service_role in production, so the
-- fixture must too — suspending as any other role is a no-op and would make this
-- suite measure nothing (found by this suite failing honestly on first run).
set local role service_role;
update public.profiles set account_status = 'suspended'
 where id = 'dd000000-0000-0000-0000-0000000000e2';
reset role;
select case when (select account_status from public.profiles where id='dd000000-0000-0000-0000-0000000000e2') = 'suspended'
  then 'ok   SUSP moderation can suspend (service path unaffected)'
  else 'SUSP-FAIL suspension did not persist' end;

-- ── the retained token: every direct write must now fail ─────────────────────
select set_config('request.jwt.claim.sub','dd000000-0000-0000-0000-0000000000e2',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
begin
  begin
    insert into public.posts (author_id, body) values ('dd000000-0000-0000-0000-0000000000e2','after suspension');
    raise exception 'SUSP-FAIL suspended member inserted a post';
  exception when others then
    if sqlerrm <> 'account_not_active' then raise; end if;
  end;
end $$;
select 'ok   SUSP suspended member cannot INSERT a post via the data plane';

do $$
begin
  begin
    update public.posts set body = 'edited while suspended'
     where id = 'dd000000-0000-0000-0000-0000000000f1';
    raise exception 'SUSP-FAIL suspended member updated their own post';
  exception when others then
    if sqlerrm <> 'account_not_active' then raise; end if;
  end;
end $$;
select 'ok   SUSP suspended member cannot UPDATE their own earlier content';

do $$
begin
  begin
    delete from public.posts where id = 'dd000000-0000-0000-0000-0000000000f1';
    raise exception 'SUSP-FAIL suspended member deleted a post';
  exception when others then
    if sqlerrm <> 'account_not_active' then raise; end if;
  end;
end $$;
select 'ok   SUSP suspended member cannot DELETE content';

do $$
begin
  begin
    insert into public.follows (follower_id, followee_id)
    values ('dd000000-0000-0000-0000-0000000000e2','dd000000-0000-0000-0000-0000000000e1');
    raise exception 'SUSP-FAIL suspended member created a social edge';
  exception when others then
    if sqlerrm <> 'account_not_active' then raise; end if;
  end;
end $$;
select 'ok   SUSP suspended member cannot create social edges';

reset role;

-- ── an unrelated ACTIVE member is unaffected ─────────────────────────────────
select set_config('request.jwt.claim.sub','dd000000-0000-0000-0000-0000000000e1',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into public.posts (id, author_id, body) values
  ('dd000000-0000-0000-0000-0000000000f2','dd000000-0000-0000-0000-0000000000e1','unaffected');
select case when exists (select 1 from public.posts where id='dd000000-0000-0000-0000-0000000000f2')
  then 'ok   SUSP an unrelated active member is unaffected (no over-broad denial)'
  else 'SUSP-FAIL active member was wrongly denied' end;
reset role;

-- ── fail-closed: predicate denies an unknown subject ─────────────────────────
select case when public.member_write_allowed('dd000000-0000-0000-0000-00000000ffff') = false
  then 'ok   SUSP predicate fails closed for an unknown profile'
  else 'SUSP-FAIL predicate allowed an unknown subject' end;

-- ── banned is denied too, and a timed suspension that has EXPIRED is allowed ──
set local role service_role;
update public.profiles set account_status = 'banned' where id = 'dd000000-0000-0000-0000-0000000000e2';
reset role;
select case when public.member_write_allowed('dd000000-0000-0000-0000-0000000000e2') = false
  then 'ok   SUSP banned accounts are denied'
  else 'SUSP-FAIL banned account allowed' end;
set local role service_role;
update public.profiles set account_status = 'active', suspended_until = now() - interval '1 day'
 where id = 'dd000000-0000-0000-0000-0000000000e2';
reset role;
select case when public.member_write_allowed('dd000000-0000-0000-0000-0000000000e2') = true
  then 'ok   SUSP an expired timed suspension restores write access'
  else 'SUSP-FAIL expired suspension still blocking' end;
set local role service_role;
update public.profiles set account_status = 'active', suspended_until = now() + interval '1 day'
 where id = 'dd000000-0000-0000-0000-0000000000e2';
reset role;
select case when public.member_write_allowed('dd000000-0000-0000-0000-0000000000e2') = false
  then 'ok   SUSP a future-dated suspension window denies writes'
  else 'SUSP-FAIL future suspension window not enforced' end;

-- ── service/definer path still works on a suspended member's rows ────────────
set local role service_role;
update public.profiles set account_status = 'suspended' where id = 'dd000000-0000-0000-0000-0000000000e2';
update public.posts set moderation_status = 'rejected' where id = 'dd000000-0000-0000-0000-0000000000f1';
reset role;
select 'ok   SUSP moderation can still act ON a suspended member''s content';

rollback;
