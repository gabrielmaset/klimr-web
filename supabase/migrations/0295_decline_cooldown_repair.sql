-- 0295_decline_cooldown_repair.sql — the decline writer learns which book the
-- reader reads.
--
-- FOUND BY the parked social_graph_checks suite (diagnostic packet,
-- 2026-08-18) and confirmed by execution: the cooldown feature has been dead
-- in production since 0238. Two generations of the same feature, half
-- migrated:
--   * 0238's request_connection (the LIVE reader) decides 'declined_recently'
--     from friendships.status = 'declined' with responded_at as the clock —
--     the connection_declines memo table is never consulted;
--   * remove_connection (still 0099's, the app's ONLY decline path via
--     app/network/actions.ts) hard-DELETES the friendship row and writes the
--     memo — the old book. Nothing anywhere writes status='declined'.
-- And one layer deeper: friendships_status_check itself allowed only
-- pending/accepted — the reader's value could never exist in the table at all.
-- Net effect, proven live on the harness: decline lands a perfect memo row
-- (right decliner, fresh timestamp) and the very next request from the
-- declined person returns 'requested'. The declined can re-request instantly,
-- forever. The dignity feature the audit-era work built twice protects no one.
--
-- WHAT THIS DOES. remove_connection is recreated to write the book the reader
-- reads: a decline of an incoming pending request MARKS the row
-- (status='declined', responded_at=now()) instead of deleting it; every other
-- removal (cancel, unfriend) deletes exactly as before. The orphaned memo
-- write is gone. 0238's reader then works as designed: 30-day window,
-- 'declined_recently' verdict, decliner outreach clears the mark. The
-- connection_declines table stays for now (0208/0209 purge lines reference it
-- harmlessly); its retirement is recorded as WP-T hygiene, not smuggled into a
-- repair. social_invariants_intact gains a drift clause pinning the
-- mark-not-delete contract. Readiness count unchanged: amendment, not
-- addition.

begin;

-- The table itself predates the reader: friendships_status_check allowed only
-- pending/accepted, so the status 0238 reads for could never exist — the
-- 'declined_recently' branch has been unreachable at the CONSTRAINT level
-- since the day it shipped. Widen it.
alter table public.friendships drop constraint friendships_status_check;
alter table public.friendships add constraint friendships_status_check
  check (status = any (array['pending'::text, 'accepted'::text, 'declined'::text]));

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

  if p_as_decline and v_was_incoming then
    -- 0295: MARK, do not delete. The live cooldown reader (0238) decides
    -- 'declined_recently' from this row's status and responded_at; deleting it
    -- here is how the cooldown died in production. The decliner reaching out
    -- later clears the mark inside request_connection itself.
    update public.friendships
       set status = 'declined', responded_at = now()
     where requester_id = p_other and addressee_id = v_me and status = 'pending';
    return;
  end if;

  delete from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_other)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_other);
end; $$;

revoke all on function public.remove_connection(uuid, boolean) from public, anon;
grant execute on function public.remove_connection(uuid, boolean) to authenticated, service_role;

comment on function public.remove_connection is
  'Cancel or unfriend deletes the edge; DECLINING an incoming pending request marks it '
  '(status=declined, responded_at=now()) so 0238''s cooldown reader can see it — the 0099 version '
  'deleted the row and wrote an orphaned memo table, which killed the cooldown in production '
  '(found by the parked social_graph_checks suite, repaired by 0295).';

-- sentinel: 0290's body verbatim, plus the mark-not-delete drift clause
create or replace function public.social_invariants_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no blocked pair holds a graph edge
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
    )
    -- no notification survives between a blocked pair, in either direction
    and not exists (
      select 1 from public.blocks b
       join public.notifications n
         on (n.user_id = b.blocker_id and n.actor_id = b.blocked_id)
         or (n.user_id = b.blocked_id and n.actor_id = b.blocker_id)
    )
    -- and the enforcement is still wired
    and exists (
      select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'notifications' and t.tgname = 'notifications_block_filter'
         and not t.tgisinternal and t.tgenabled <> 'D'
    )
    -- the decline verb MARKS, never deletes (0295): the live cooldown reader
    -- (0238) consults friendships.status='declined'; a writer that deletes the
    -- row starves that reader and the cooldown silently dies — which is
    -- exactly what production did between 0238 and 0295.
    and (select position('status = ''declined''' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'remove_connection' limit 1)
    -- and the counter projections agree with the edges (0290)
    and not exists (
      select 1
        from public.profiles p
        left join (select follower_id as id, count(*) as n
                     from public.follows group by 1) fo on fo.id = p.id
        left join (select followee_id as id, count(*) as n
                     from public.follows group by 1) fr on fr.id = p.id
        left join (select x.id, count(*) as n
                     from (select requester_id as id from public.friendships where status = 'accepted'
                           union all
                           select addressee_id from public.friendships where status = 'accepted') x
                    group by 1) cn on cn.id = p.id
       where p.following_count   <> coalesce(fo.n, 0)
          or p.followers_count   <> coalesce(fr.n, 0)
          or p.connections_count <> coalesce(cn.n, 0)
    );
$$;

revoke all on function public.social_invariants_intact() from public, anon, authenticated;
grant execute on function public.social_invariants_intact() to service_role;

select public.journal_migration('0295', '0295_decline_cooldown_repair.sql', null,
  'Repairs the decline cooldown, dead in production since 0238 at three layers (constraint forbade the status; nothing wrote it; the writer wrote an unread memo): remove_connection (the app''s only decline path) deleted the friendship row and wrote the orphaned connection_declines memo, while the live reader decides declined_recently from friendships.status — which nothing wrote. Decline now MARKS the incoming pending row (status=declined, responded_at=now()); cancel/unfriend delete as before; the memo write is removed. social_invariants_intact gains a mark-not-delete drift clause (amendment; count unchanged). Found by the parked social_graph_checks suite; the broken flow was proven by execution before this fix.');

commit;
