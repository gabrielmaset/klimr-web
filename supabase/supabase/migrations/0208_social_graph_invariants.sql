-- 0208_social_graph_invariants.sql — KCDX-027 and KCDX-028 (P1).
--
-- ── KCDX-027: the mutual-request race ────────────────────────────────────
-- `request_connection` locks the pair row `for update` — but only if one already
-- exists. When neither person has asked yet there is nothing to lock, so two
-- simultaneous opposite-direction requests both find no row, both fall through
-- to the insert, one wins, and the loser lands in `exception when
-- unique_violation` which returns `'already_requested'` **without re-reading**.
--
-- The outcome is wrong in both directions at once. The pair ends up `pending`
-- when it should be `accepted` — both people asked, which is the definition of
-- mutual consent — and the second person is told they had already asked, which
-- they had not. Two friends tapping Connect on each other at the same moment is
-- not an exotic schedule; it is what happens when two people are looking at each
-- other's profiles after a match.
--
-- The lock has to be taken on the PAIR, not on a row, because the row is what
-- may not exist yet. A transaction advisory lock keyed on the canonical ordered
-- pair does that: it serializes A→B against B→A with nothing in the table.
-- The unique-violation branch keeps a re-read anyway, as the belt to that brace.
--
-- ── KCDX-028: block is not one invariant ─────────────────────────────────
-- `block_player` removes friendships, follows and the PYMK cache. It leaves
-- pending connection requests in `connection_declines`, leaves notifications
-- already queued, and — the one that matters — leaves the two people able to
-- keep finding each other through surfaces that never learned about the block.
--
-- Worse, unblocking is not a function at all: `app/profile/[id]/actions.ts` and
-- `app/settings/actions.ts` both DELETE from `blocks` directly. So "block" is a
-- transaction and "unblock" is a raw delete in two places, which is how the two
-- halves of one invariant drift apart.
--
-- Both become commands. The edge-removal matrix is written down once, in SQL,
-- where every surface inherits it.

-- ── 1. requesting a connection, with the pair locked ──────────────────────
create or replace function public.request_connection(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me          uuid := auth.uid();
  v_row         public.friendships%rowtype;
  v_declined_at timestamptz;
  v_declined_by uuid;
  v_lo          uuid;
  v_hi          uuid;
begin
  if v_me is null or p_target is null or p_target = v_me then return 'invalid'; end if;

  if exists (
    select 1 from public.blocks
     where (blocker_id = v_me and blocked_id = p_target)
        or (blocker_id = p_target and blocked_id = v_me)
  ) then
    return 'blocked';
  end if;

  if not public.check_rate_limit('conn-req:' || v_me::text, 20, 86400) then
    return 'rate_limited';
  end if;

  v_lo := least(v_me, p_target);
  v_hi := greatest(v_me, p_target);

  -- KCDX-027. The row-level `for update` below only locks something that already
  -- EXISTS, which is precisely the case this race is not. This advisory lock is
  -- keyed on the ordered pair, so A→B and B→A serialize against each other even
  -- when the table holds nothing for them yet. Transaction-scoped: released on
  -- commit or rollback, never leaked.
  perform pg_advisory_xact_lock(hashtextextended(v_lo::text || ':' || v_hi::text, 0));

  select * into v_row from public.friendships
   where least(requester_id, addressee_id) = v_lo
     and greatest(requester_id, addressee_id) = v_hi
   for update;

  if found then
    if v_row.status = 'accepted' then return 'already_connected'; end if;
    if v_row.requester_id = v_me then return 'already_requested'; end if;
    -- They asked first — sending back means yes.
    update public.friendships set status = 'accepted', responded_at = now() where id = v_row.id;
    delete from public.connection_declines where pair_lo = v_lo and pair_hi = v_hi;
    delete from public.pymk_cache where user_id in (v_me, p_target);
    return 'accepted';
  end if;

  select declined_at, declined_by into v_declined_at, v_declined_by
    from public.connection_declines where pair_lo = v_lo and pair_hi = v_hi;
  if v_declined_by = p_target and v_declined_at > now() - interval '14 days' then
    return 'cooldown';
  end if;
  delete from public.connection_declines where pair_lo = v_lo and pair_hi = v_hi;

  begin
    insert into public.friendships (requester_id, addressee_id, status) values (v_me, p_target, 'pending');
  exception when unique_violation then
    -- Should be unreachable under the advisory lock. Kept because "should be
    -- unreachable" is exactly the assumption the original code made, and a
    -- second connection pooler, a replica, or a future caller that forgets the
    -- lock would land here. Re-read and take the same reverse-accept branch
    -- rather than reporting a request the caller never made.
    select * into v_row from public.friendships
     where least(requester_id, addressee_id) = v_lo
       and greatest(requester_id, addressee_id) = v_hi
     for update;
    if not found then return 'error'; end if;
    if v_row.status = 'accepted' then return 'already_connected'; end if;
    if v_row.requester_id = v_me then return 'already_requested'; end if;
    update public.friendships set status = 'accepted', responded_at = now() where id = v_row.id;
    delete from public.connection_declines where pair_lo = v_lo and pair_hi = v_hi;
    delete from public.pymk_cache where user_id in (v_me, p_target);
    return 'accepted';
  end;
  return 'requested';
end;
$$;

-- ── 2. block, as one transaction with a written-down matrix ───────────────
create or replace function public.block_player(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_lo uuid; v_hi uuid;
begin
  if v_me is null or p_target is null or p_target = v_me then return; end if;
  v_lo := least(v_me, p_target);
  v_hi := greatest(v_me, p_target);

  -- Same pair lock as the request path: a block landing at the same moment as a
  -- connection request must not interleave with it.
  perform pg_advisory_xact_lock(hashtextextended(v_lo::text || ':' || v_hi::text, 0));

  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_target)
  on conflict (blocker_id, blocked_id) do nothing;

  -- THE EDGE-REMOVAL MATRIX. Written here so every surface inherits it rather
  -- than each remembering its own share.
  --   graph        — the connection in either direction, accepted or pending
  delete from public.friendships
   where least(requester_id, addressee_id) = v_lo and greatest(requester_id, addressee_id) = v_hi;
  --   follows      — both directions
  delete from public.follows
   where (follower_id = v_me and followee_id = p_target)
      or (follower_id = p_target and followee_id = v_me);
  --   decline memo — a cooldown between two people who no longer have a
  --                  relationship is stale state that outlives its purpose
  delete from public.connection_declines where pair_lo = v_lo and pair_hi = v_hi;
  --   recommendations — neither should be suggested to the other again
  delete from public.pymk_cache where user_id in (v_me, p_target);
  --   notifications  — NOT purged here, and the reason is worth stating rather
  --                    than leaving as an omission. `notifications` has no actor
  --                    column (id, user_id, kind, title, body, link_url, read_at,
  --                    created_at), so there is no way to identify "items about
  --                    this person" without parsing link_url or title, and a
  --                    delete driven by string matching would eventually remove
  --                    the wrong row. The honest fix is an `actor_id` column on
  --                    notifications, which is a schema change with its own
  --                    backfill and belongs in the notifications batch, not
  --                    smuggled in here. Until then, blocking hides the person
  --                    everywhere they are rendered; an already-delivered
  --                    notification may still name them.
end;
$$;

-- ── 3. unblock, which was not a function at all ───────────────────────────
-- Two server actions deleted from `blocks` directly. A raw delete is not the
-- inverse of the transaction above: it restores visibility without restoring
-- anything, which is correct, but it also bypassed the pair lock and left no
-- single place to change when the matrix grows.
create or replace function public.unblock_player(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or p_target is null then return; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(v_me, p_target)::text || ':' || greatest(v_me, p_target)::text, 0));

  delete from public.blocks where blocker_id = v_me and blocked_id = p_target;

  -- Deliberately NOT restoring the connection or the follows. Unblocking means
  -- "you may find me again", not "we are friends again" — re-establishing a
  -- relationship is the two people's decision, not a side effect of undoing a
  -- protective action. The PYMK cache is cleared so they can be suggested again.
  delete from public.pymk_cache where user_id in (v_me, p_target);
end;
$$;

revoke all on function public.unblock_player(uuid) from public, anon;
grant execute on function public.unblock_player(uuid) to authenticated, service_role;

-- ── 4. keep it closed ─────────────────────────────────────────────────────
create or replace function public.social_invariants_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- a blocked pair holds no graph edge in either direction
    not exists (
      select 1 from public.blocks b
       where exists (
         select 1 from public.friendships f
          where least(f.requester_id, f.addressee_id) = least(b.blocker_id, b.blocked_id)
            and greatest(f.requester_id, f.addressee_id) = greatest(b.blocker_id, b.blocked_id)
       )
    )
    and not exists (
      select 1 from public.blocks b
       join public.follows f
         on (f.follower_id = b.blocker_id and f.followee_id = b.blocked_id)
         or (f.follower_id = b.blocked_id and f.followee_id = b.blocker_id)
    );
$$;

revoke all on function public.social_invariants_intact() from public, anon, authenticated;
grant execute on function public.social_invariants_intact() to service_role;
