-- 0099_social_graph_v2.sql — hardened, sports-aware social graph.
-- What this fixes (found in audit):
--   • friendships uniqueness was per-DIRECTION: A→B and B→A could coexist
--     (duplicate pendings, double-accepted, races in check-then-insert actions)
--   • blocking didn't sever friendships/follows and didn't stop the blocked
--     person from requesting/following/seeing the blocker
--   • no rate limits, no decline memory (infinite re-request harassment)
--   • no counters, no mutual connections, no recommendations
-- What this adds:
--   1) cross-direction cleanup + canonical-pair UNIQUE index (race backstop)
--   2) block-severing + block guards at the DB level (triggers)
--   3) transaction-safe SECURITY DEFINER RPCs for every graph write
--      (self/active/block checks, decline cooldown, rate limits INSIDE the txn)
--   4) denormalized counters on profiles (connections/followers/following) + backfill
--   5) set-based mutuals, relationship context, and People-You-May-Know RPCs
--   6) tightened RLS: graph writes only through the RPCs
-- Idempotent. Run AFTER 0098.

-- ========== 1) integrity: cleanup + canonical pair uniqueness ==========

-- Remove cross-direction duplicates (keep accepted over pending, then oldest).
with ranked as (
  select id,
         row_number() over (
           partition by least(requester_id, addressee_id), greatest(requester_id, addressee_id)
           order by (status = 'accepted') desc, created_at asc
         ) as rn
  from public.friendships
)
delete from public.friendships f
using ranked r
where f.id = r.id and r.rn > 1;

create unique index if not exists friendships_pair_uniq
  on public.friendships ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id)));

-- Decline memory: lets us cool down re-requests without keeping tombstone rows
-- in friendships (which every reader would then have to filter).
create table if not exists public.connection_declines (
  pair_lo     uuid not null,
  pair_hi     uuid not null,
  declined_by uuid not null references public.profiles(id) on delete cascade,
  declined_at timestamptz not null default now(),
  primary key (pair_lo, pair_hi),
  check (pair_lo < pair_hi)
);
alter table public.connection_declines enable row level security;
grant all on public.connection_declines to service_role;
-- no user policies: only the RPCs below touch it.

-- ========== 2) blocks that actually block ==========

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_blocked_pair(uuid, uuid) to service_role;

-- DB-level guards: no friendship/follow row can be created across a block,
-- no matter which code path tries. Returning NULL silently cancels the insert.
create or replace function public.guard_friendship_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_pair(new.requester_id, new.addressee_id) then
    return null;
  end if;
  return new;
end; $$;
drop trigger if exists friendships_block_guard on public.friendships;
create trigger friendships_block_guard
  before insert on public.friendships
  for each row execute function public.guard_friendship_block();

create or replace function public.guard_follow_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_pair(new.follower_id, new.followee_id) then
    return null;
  end if;
  return new;
end; $$;
drop trigger if exists follows_block_guard on public.follows;
create trigger follows_block_guard
  before insert on public.follows
  for each row execute function public.guard_follow_block();

-- Reverse-direction index so "who blocked me" checks are as fast as "whom I blocked".
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- ========== 3) denormalized counters ==========

alter table public.profiles add column if not exists connections_count int not null default 0;
alter table public.profiles add column if not exists followers_count   int not null default 0;
alter table public.profiles add column if not exists following_count   int not null default 0;

create or replace function public.friendship_counters()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'accepted' then
    update public.profiles set connections_count = connections_count + 1 where id in (new.requester_id, new.addressee_id);
  elsif tg_op = 'UPDATE' then
    if old.status <> 'accepted' and new.status = 'accepted' then
      update public.profiles set connections_count = connections_count + 1 where id in (new.requester_id, new.addressee_id);
    elsif old.status = 'accepted' and new.status <> 'accepted' then
      update public.profiles set connections_count = greatest(connections_count - 1, 0) where id in (new.requester_id, new.addressee_id);
    end if;
  elsif tg_op = 'DELETE' and old.status = 'accepted' then
    update public.profiles set connections_count = greatest(connections_count - 1, 0) where id in (old.requester_id, old.addressee_id);
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists friendships_counters on public.friendships;
create trigger friendships_counters
  after insert or update or delete on public.friendships
  for each row execute function public.friendship_counters();

create or replace function public.follow_counters()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists follows_counters on public.follows;
create trigger follows_counters
  after insert or delete on public.follows
  for each row execute function public.follow_counters();

-- One-time backfill so counters match reality from day one.
update public.profiles p set connections_count = coalesce(c.n, 0)
from (
  select u.id, count(*) as n from (
    select requester_id as id from public.friendships where status = 'accepted'
    union all
    select addressee_id from public.friendships where status = 'accepted'
  ) u group by u.id
) c where c.id = p.id;
update public.profiles p set followers_count = coalesce(c.n, 0)
from (select followee_id as id, count(*) as n from public.follows group by followee_id) c where c.id = p.id;
update public.profiles p set following_count = coalesce(c.n, 0)
from (select follower_id as id, count(*) as n from public.follows group by follower_id) c where c.id = p.id;

-- Recommendation cache: computed lazily by the app, invalidated by the RPCs
-- below whenever the graph around a user changes (accept / block).
create table if not exists public.pymk_cache (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  payload     jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.pymk_cache enable row level security;
grant all on public.pymk_cache to service_role;

-- ========== 4) transaction-safe graph writes (the only write path) ==========

-- Send (or auto-accept) a connection request. Every check happens inside one
-- transaction with the pair row locked, and the unique pair index is the
-- backstop, so concurrent duplicates are impossible.
create or replace function public.request_connection(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row public.friendships%rowtype;
  v_declined_at timestamptz;
  v_declined_by uuid;
begin
  if v_me is null then return 'unauthenticated'; end if;
  if p_target is null or p_target = v_me then return 'invalid'; end if;

  -- Both accounts must exist and be active; blocks make the target unavailable
  -- (same answer as nonexistent, so blocking is never leaked).
  if not exists (select 1 from public.profiles where id = v_me and account_status = 'active') then return 'invalid'; end if;
  if not exists (select 1 from public.profiles where id = p_target and account_status = 'active')
     or public.is_blocked_pair(v_me, p_target) then
    return 'unavailable';
  end if;

  if not public.check_rate_limit('conn-req:' || v_me::text, 20, 86400) then
    return 'rate_limited';
  end if;

  -- Lock the pair row if one exists (serializes concurrent A→B / B→A sends).
  select * into v_row from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_target)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_target)
  for update;

  if found then
    if v_row.status = 'accepted' then return 'already_connected'; end if;
    if v_row.requester_id = v_me then return 'already_requested'; end if;
    -- They asked first — sending back means yes.
    update public.friendships set status = 'accepted', responded_at = now() where id = v_row.id;
    delete from public.connection_declines where pair_lo = least(v_me, p_target) and pair_hi = greatest(v_me, p_target);
    delete from public.pymk_cache where user_id in (v_me, p_target);
    return 'accepted';
  end if;

  -- Decline cooldown: if THEY declined me recently, don't let me spam.
  select declined_at, declined_by into v_declined_at, v_declined_by
  from public.connection_declines
  where pair_lo = least(v_me, p_target) and pair_hi = greatest(v_me, p_target);
  if v_declined_by = p_target and v_declined_at > now() - interval '14 days' then
    return 'cooldown';
  end if;
  -- If I previously declined them and am now reaching out, clear the memory.
  delete from public.connection_declines where pair_lo = least(v_me, p_target) and pair_hi = greatest(v_me, p_target);

  begin
    insert into public.friendships (requester_id, addressee_id, status) values (v_me, p_target, 'pending');
  exception when unique_violation then
    return 'already_requested';
  end;
  return 'requested';
end; $$;

create or replace function public.accept_connection(p_requester uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_updated int;
begin
  if v_me is null or p_requester is null or p_requester = v_me then return false; end if;
  if public.is_blocked_pair(v_me, p_requester) then return false; end if;
  update public.friendships set status = 'accepted', responded_at = now()
  where requester_id = p_requester and addressee_id = v_me and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    delete from public.connection_declines where pair_lo = least(v_me, p_requester) and pair_hi = greatest(v_me, p_requester);
    delete from public.pymk_cache where user_id in (v_me, p_requester);
    return true;
  end if;
  return false;
end; $$;

-- Decline an incoming request, cancel a sent one, or unfriend — all one shape.
-- p_as_decline records the decline (for the cooldown) when I'm the addressee.
create or replace function public.remove_connection(p_other uuid, p_as_decline boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_was_incoming boolean;
begin
  if v_me is null or p_other is null or p_other = v_me then return; end if;
  select exists (
    select 1 from public.friendships
    where requester_id = p_other and addressee_id = v_me and status = 'pending'
  ) into v_was_incoming;

  delete from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_other)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_other);

  if p_as_decline and v_was_incoming then
    insert into public.connection_declines (pair_lo, pair_hi, declined_by)
    values (least(v_me, p_other), greatest(v_me, p_other), v_me)
    on conflict (pair_lo, pair_hi) do update set declined_by = excluded.declined_by, declined_at = now();
  end if;
end; $$;

create or replace function public.follow_player(p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or p_target is null or p_target = v_me then return false; end if;
  if not exists (select 1 from public.profiles where id = v_me and account_status = 'active') then return false; end if;
  if not exists (select 1 from public.profiles where id = p_target and account_status = 'active')
     or public.is_blocked_pair(v_me, p_target) then return false; end if;
  if not public.check_rate_limit('follow:' || v_me::text, 100, 3600) then return false; end if;
  insert into public.follows (follower_id, followee_id) values (v_me, p_target)
  on conflict (follower_id, followee_id) do nothing;
  return true;
end; $$;

create or replace function public.unfollow_player(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_target is null then return; end if;
  delete from public.follows where follower_id = auth.uid() and followee_id = p_target;
end; $$;

-- Blocking severs the relationship in every direction, immediately.
create or replace function public.block_player(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or p_target is null or p_target = v_me then return; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_target)
  on conflict (blocker_id, blocked_id) do nothing;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_target)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_target);
  delete from public.follows
  where (follower_id = v_me and followee_id = p_target) or (follower_id = p_target and followee_id = v_me);
  delete from public.pymk_cache where user_id in (v_me, p_target);
end; $$;

-- ========== 5) mutuals, context, and People You May Know ==========

-- The viewer's accepted connections, as a reusable set.
create or replace function public.connections_of(p_user uuid)
returns table (friend_id uuid) language sql stable security definer set search_path = public as $$
  select case when requester_id = p_user then addressee_id else requester_id end
  from public.friendships
  where status = 'accepted' and (requester_id = p_user or addressee_id = p_user);
$$;

create or replace function public.mutual_connections(p_other uuid, p_limit int default 12)
returns table (user_id uuid, display_name text, avatar_hue int, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_hue, p.avatar_path
  from public.connections_of(auth.uid()) a
  join public.connections_of(p_other) b on b.friend_id = a.friend_id
  join public.profiles p on p.id = a.friend_id
  where p.account_status = 'active'
    and not public.is_blocked_pair(auth.uid(), p.id)
    and not public.is_blocked_pair(auth.uid(), p_other)
  order by p.display_name
  limit greatest(p_limit, 0);
$$;

create or replace function public.mutual_connections_count(p_other uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_blocked_pair(auth.uid(), p_other) then 0 else (
    select count(*)::int
    from public.connections_of(auth.uid()) a
    join public.connections_of(p_other) b on b.friend_id = a.friend_id
  ) end;
$$;

-- Everything a profile needs to say "here's how you two overlap", in one call.
create or replace function public.relationship_context(p_other uuid)
returns table (
  mutual_count int,
  shared_sports text[],
  same_city boolean,
  same_neighborhood boolean,
  played_together int,
  shared_team text,
  co_tournaments int
) language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_other is null or p_other = v_me or public.is_blocked_pair(v_me, p_other) then
    return query select 0, array[]::text[], false, false, 0, null::text, 0;
    return;
  end if;
  return query
  select
    public.mutual_connections_count(p_other),
    coalesce((
      select array_agg(a.sport_key order by a.sport_key)
      from public.player_sports a
      join public.player_sports b on b.sport_key = a.sport_key and b.user_id = p_other and b.active
      where a.user_id = v_me and a.active
    ), array[]::text[]),
    exists (select 1 from public.profiles x, public.profiles y
            where x.id = v_me and y.id = p_other and x.city is not null and x.city = y.city),
    exists (select 1 from public.profiles x, public.profiles y
            where x.id = v_me and y.id = p_other and x.neighborhood is not null and x.neighborhood = y.neighborhood),
    (select count(*)::int from public.match_participants a
      join public.match_participants b on b.match_id = a.match_id and b.user_id = p_other
      where a.user_id = v_me),
    (select t.name from public.team_members a
      join public.team_members b on b.team_id = a.team_id and b.user_id = p_other
      join public.teams t on t.id = a.team_id and t.deleted_at is null
      where a.user_id = v_me limit 1),
    (select count(distinct a.tournament_id)::int from public.tournament_registration_players a
      join public.tournament_registration_players b on b.tournament_id = a.tournament_id and b.user_id = p_other
      where a.user_id = v_me);
end; $$;

-- Recommendation cache lives above (created before the RPCs that invalidate it).

-- People You May Know — sports-aware, set-based, bounded.
-- Candidates come from five indexed pools (each capped), then get scored:
--   mutual connections ×5 · shared team +6 · played together ×3 (cap 5)
--   shared active sports +2 each (cap 2) · same ZIP +3 / same city +1
--   matching skill level on a shared sport +2
-- Excluded: self, existing pair rows in ANY state, blocked pairs (either
-- direction), inactive accounts. Never exposes anything the viewer couldn't
-- already see on a profile.
create or replace function public.people_you_may_know(p_limit int default 12)
returns table (
  user_id uuid,
  display_name text,
  avatar_hue int,
  avatar_path text,
  verification_status public.verification_status,
  city text,
  neighborhood text,
  primary_sport text,
  score numeric,
  mutual_count int,
  shared_sports text[],
  played_together int,
  shared_team boolean,
  same_area text
) language sql stable security definer set search_path = public as $$
with me as (
  select p.id, p.home_zip, p.city from public.profiles p where p.id = auth.uid()
),
my_friends as (select friend_id from public.connections_of(auth.uid())),
my_sports as (select sport_key, skill_level from public.player_sports where user_id = auth.uid() and active),
cand_raw as (
  -- friends of friends
  (select c2.friend_id as cid from my_friends f
     cross join lateral public.connections_of(f.friend_id) c2
   limit 400)
  union all
  -- played together
  (select b.user_id from public.match_participants a
     join public.match_participants b on b.match_id = a.match_id and b.user_id <> a.user_id
   where a.user_id = auth.uid() limit 400)
  union all
  -- same ZIP, plays one of my sports
  (select ps.user_id from me, public.profiles p
     join public.player_sports ps on ps.user_id = p.id and ps.active
   where p.home_zip = me.home_zip and ps.sport_key in (select sport_key from my_sports)
   limit 200)
  union all
  -- teammates
  (select b.user_id from public.team_members a
     join public.team_members b on b.team_id = a.team_id and b.user_id <> a.user_id
   where a.user_id = auth.uid() limit 200)
  union all
  -- co-registered in a tournament
  (select b.user_id from public.tournament_registration_players a
     join public.tournament_registration_players b on b.tournament_id = a.tournament_id and b.user_id <> a.user_id
   where a.user_id = auth.uid() limit 200)
),
cand as (
  select cr.cid from cand_raw cr
  where cr.cid is not null
    and cr.cid <> auth.uid()
    and cr.cid not in (select friend_id from my_friends)
    and not exists (
      select 1 from public.friendships f
      where least(f.requester_id, f.addressee_id) = least(auth.uid(), cr.cid)
        and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), cr.cid)
    )
    and not public.is_blocked_pair(auth.uid(), cr.cid)
  group by cr.cid
),
scored as (
  select
    c.cid,
    coalesce(m.n, 0)  as mutual_count,
    coalesce(pt.n, 0) as played_together,
    coalesce(sp.sports, array[]::text[]) as shared_sports,
    coalesce(sp.skill_match, false) as skill_match,
    coalesce(tm.shared, false) as shared_team,
    case when pr.home_zip is not null and pr.home_zip = me.home_zip then 'zip'
         when pr.city is not null and pr.city = me.city then 'city'
         else null end as same_area,
    pr.display_name, pr.avatar_hue, pr.avatar_path, pr.verification_status, pr.city, pr.neighborhood, pr.primary_sport
  from cand c
  cross join me
  join public.profiles pr on pr.id = c.cid and pr.account_status = 'active'
  left join lateral (
    select count(*)::int as n from my_friends f
    join public.connections_of(c.cid) fc on fc.friend_id = f.friend_id
  ) m on true
  left join lateral (
    select count(*)::int as n from public.match_participants a
    join public.match_participants b on b.match_id = a.match_id and b.user_id = c.cid
    where a.user_id = auth.uid()
  ) pt on true
  left join lateral (
    select array_agg(ms.sport_key order by ms.sport_key) as sports,
           bool_or(ms.skill_level = ps.skill_level) as skill_match
    from my_sports ms
    join public.player_sports ps on ps.sport_key = ms.sport_key and ps.user_id = c.cid and ps.active
  ) sp on true
  left join lateral (
    select true as shared from public.team_members a
    join public.team_members b on b.team_id = a.team_id and b.user_id = c.cid
    where a.user_id = auth.uid() limit 1
  ) tm on true
)
select
  s.cid, s.display_name, s.avatar_hue, s.avatar_path, s.verification_status, s.city, s.neighborhood, s.primary_sport,
  (s.mutual_count * 5
   + least(s.played_together, 5) * 3
   + (case when s.shared_team then 6 else 0 end)
   + least(coalesce(array_length(s.shared_sports, 1), 0), 2) * 2
   + (case s.same_area when 'zip' then 3 when 'city' then 1 else 0 end)
   + (case when s.skill_match then 2 else 0 end))::numeric as score,
  s.mutual_count, s.shared_sports, s.played_together, s.shared_team, s.same_area
from scored s
order by score desc, s.mutual_count desc, s.display_name
limit greatest(p_limit, 0);
$$;

-- ========== 6) tighten RLS: writes only through the RPCs ==========
drop policy if exists "friendships request own" on public.friendships;
drop policy if exists "friendships accept as addressee" on public.friendships;
drop policy if exists "follows insert own" on public.follows;
-- (select + delete policies remain: reading your rows and cancel/unfriend/unfollow
--  by hand stay safe; all creation and acceptance is RPC-only.)

-- ========== grants ==========
revoke all on function public.request_connection(uuid) from public, anon;
revoke all on function public.accept_connection(uuid) from public, anon;
revoke all on function public.remove_connection(uuid, boolean) from public, anon;
revoke all on function public.follow_player(uuid) from public, anon;
revoke all on function public.unfollow_player(uuid) from public, anon;
revoke all on function public.block_player(uuid) from public, anon;
revoke all on function public.mutual_connections(uuid, int) from public, anon;
revoke all on function public.mutual_connections_count(uuid) from public, anon;
revoke all on function public.relationship_context(uuid) from public, anon;
revoke all on function public.people_you_may_know(int) from public, anon;
revoke all on function public.connections_of(uuid) from public, anon, authenticated;

grant execute on function public.request_connection(uuid) to authenticated, service_role;
grant execute on function public.accept_connection(uuid) to authenticated, service_role;
grant execute on function public.remove_connection(uuid, boolean) to authenticated, service_role;
grant execute on function public.follow_player(uuid) to authenticated, service_role;
grant execute on function public.unfollow_player(uuid) to authenticated, service_role;
grant execute on function public.block_player(uuid) to authenticated, service_role;
grant execute on function public.mutual_connections(uuid, int) to authenticated, service_role;
grant execute on function public.mutual_connections_count(uuid) to authenticated, service_role;
grant execute on function public.relationship_context(uuid) to authenticated, service_role;
grant execute on function public.people_you_may_know(int) to authenticated, service_role;
grant execute on function public.connections_of(uuid) to service_role;
