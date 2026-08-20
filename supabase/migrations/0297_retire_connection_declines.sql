-- 0297_retire_connection_declines.sql — the memo table nobody read is retired.
--
-- KFU-027 (WP-T) closing the tail of the 0295 finding: `connection_declines`
-- was written by `remove_connection` (a hard-delete-plus-memo design from
-- 0208/0209) and NEVER read by anything — 0295 repaired the cooldown by
-- marking the row itself ('declined' + responded_at), which made the memo
-- table pure dead weight. Two live functions still PURGED it on their way
-- through (accept_connection, block_player); both are recreated below from
-- their LIVE definitions (pg_get_functiondef on the harness at head 0296,
-- verbatim-carry doctrine) minus only that purge line, then the table drops.
-- The social suite has zero references (checked); the cooldown contract
-- ('declined_recently', 30 days) lives entirely on user_connections rows and
-- is proven by social_graph_checks CHECK 4.

begin;

CREATE OR REPLACE FUNCTION public.accept_connection(p_requester uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    delete from public.pymk_cache where user_id in (v_me, p_requester);
    return true;
  end if;
  return false;
end; $function$;

CREATE OR REPLACE FUNCTION public.block_player(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid := auth.uid(); v_lo uuid; v_hi uuid;
begin
  if v_me is null or p_target is null or p_target = v_me then return; end if;
  v_lo := least(v_me, p_target);
  v_hi := greatest(v_me, p_target);

  perform pg_advisory_xact_lock(hashtextextended(v_lo::text || ':' || v_hi::text, 0));

  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_target)
  on conflict (blocker_id, blocked_id) do nothing;

  -- THE EDGE-REMOVAL MATRIX, in one place so every surface inherits it.
  --   graph — the connection in either direction, accepted or pending
  delete from public.friendships
   where least(requester_id, addressee_id) = v_lo and greatest(requester_id, addressee_id) = v_hi;
  --   follows — both directions
  delete from public.follows
   where (follower_id = v_me and followee_id = p_target)
      or (follower_id = p_target and followee_id = v_me);
  --   recommendations — neither is suggested to the other again
  delete from public.pymk_cache where user_id in (v_me, p_target);
  --   notifications — BOTH directions. The person who blocked should stop
  --   hearing about the other, and the blocked person should stop hearing about
  --   the blocker: a bell that goes quiet in only one direction is a signal.
  delete from public.notifications
   where (user_id = v_me and actor_id = p_target)
      or (user_id = p_target and actor_id = v_me);
end;
$function$;

-- ACLs restated to match the live grants (verified via proacl pre-migration).
revoke all on function public.accept_connection(uuid) from public, anon;
revoke all on function public.block_player(uuid) from public, anon;
grant execute on function public.accept_connection(uuid) to authenticated, service_role;
grant execute on function public.block_player(uuid) to authenticated, service_role;

drop table public.connection_declines;

select public.journal_migration('0297', '0297_retire_connection_declines.sql',
  '405a86c1f2b4acfaef7f9885d7956123b2d38b357ede996ee6501f91f282cf49',
  'KFU-027/WP-T: retires the orphaned connection_declines memo table (written, never read; superseded by 0295 marking declines on user_connections). accept_connection and block_player recreated from live defs minus their purge lines; ACLs restated; table dropped. Social suite reference-free; cooldown proven by social_graph_checks CHECK 4.');

commit;
