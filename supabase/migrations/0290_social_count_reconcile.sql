-- 0290_social_count_reconcile.sql — the social counters stop being able to lie.
--
-- WHAT EXISTS. profiles carries three denormalized projections — following_count,
-- followers_count, connections_count — maintained by 0099's increment/decrement
-- triggers on follows and friendships, and read directly by /network's tab badges
-- (app/network/page.tsx). Trigger-maintained projections desync whenever rows move
-- without triggers: the 2026-08-18 seed wipe deleted every edge with user triggers
-- deliberately disabled (teardown semantics), so the two surviving profiles kept
-- their pre-wipe totals — the page showed "Friends 43" over an empty list. Nothing
-- detected it, because no control compared the projection to the edges.
--
-- WHAT THIS ADDS — the points-ledger doctrine (0200/0252) applied to the graph:
--   * reconcile_social_counts(): one set-based statement recomputing all three
--     columns for every profile from the edge tables; returns rows corrected.
--     Operational/repair surface, service_role only — never a hot path.
--   * social_invariants_intact() gains a fifth clause: every profile's three
--     counters must equal the edge-derived truth. A stale projection now turns the
--     readiness sentinel red instead of quietly rendering on a page.
--   * Runs the reconciler ONCE on apply, repairing the current production rows in
--     the same paste — recorded here, not as an editor one-off.
-- Standing rule recorded with it: any bulk operation that disables user triggers
-- must end by running the reconcilers for every projection those triggers maintain.

begin;

create or replace function public.reconcile_social_counts()
returns integer
language sql
security definer
set search_path = public
as $$
  with truth as (
    select p.id,
           coalesce(fo.n, 0) as following_n,
           coalesce(fr.n, 0) as followers_n,
           coalesce(cn.n, 0) as connections_n
      from public.profiles p
      left join (select follower_id as id, count(*) as n
                   from public.follows group by 1) fo using (id)
      left join (select followee_id as id, count(*) as n
                   from public.follows group by 1) fr using (id)
      left join (select x.id, count(*) as n
                   from (select requester_id as id from public.friendships where status = 'accepted'
                         union all
                         select addressee_id from public.friendships where status = 'accepted') x
                  group by 1) cn using (id)
  ), upd as (
    update public.profiles p
       set following_count   = t.following_n,
           followers_count   = t.followers_n,
           connections_count = t.connections_n
      from truth t
     where t.id = p.id
       and (p.following_count   <> t.following_n
         or p.followers_count   <> t.followers_n
         or p.connections_count <> t.connections_n)
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.reconcile_social_counts() from public, anon, authenticated;
grant execute on function public.reconcile_social_counts() to service_role;

comment on function public.reconcile_social_counts is
  'Recomputes profiles.following_count / followers_count / connections_count from the follows and '
  'friendships tables in one set-based pass; returns rows corrected. The repair half of the '
  'projection-agrees-with-ledger doctrine for the social graph. Run after any bulk operation that '
  'touched edges with triggers disabled.';

-- social_invariants_intact: 0209''s four clauses verbatim, plus the drift clause.
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

comment on function public.social_invariants_intact is
  'KCDX-027/028 boundary sentinel (0208/0209), extended by 0290: also fails if any profile''s '
  'following/followers/connections counters disagree with the counts derived from follows and '
  'friendships — a stale projection is a lie a page will render.';

-- run-once repair: fixes the current rows in the same paste that adds the control
select public.reconcile_social_counts() as rows_corrected;

select public.journal_migration('0290', '0290_social_count_reconcile.sql', null,
  'Adds reconcile_social_counts() (set-based recompute of the three profile counter projections from follows/friendships) and extends social_invariants_intact with a projection-drift clause, then runs the reconciler once — repairing the counters the 2026-08-18 seed wipe left stale on the two surviving profiles (edges deleted with user triggers disabled, so 0099''s decrements never fired).');

commit;
