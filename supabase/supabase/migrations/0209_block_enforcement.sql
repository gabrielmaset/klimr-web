-- 0209_block_enforcement.sql — blocking becomes one predicate that every surface
-- consults, and notifications learn who they are about.
--
-- 0208 made block and unblock into commands that sever the graph. This is the
-- other half: what a blocked pair must stop SEEING. The requirement is
-- symmetric — neither the person who blocked nor the person who was blocked
-- should receive the other's notifications or see their content — because a
-- one-sided block tells the blocked person they were blocked, which is its own
-- harm.
--
-- ── WHAT WAS ACTUALLY MISSING ────────────────────────────────────────────
-- Not everything. `posts` filters blocks in its RLS policy, `post_visible()`
-- does the same, and `get_ranked_feed` runs with INVOKER rights so that policy
-- applies to the main feed. That was worth checking rather than assuming: the
-- ranked feed reads `public.posts` directly and looks unfiltered until you
-- notice it is not SECURITY DEFINER.
--
-- Two real gaps:
--
--   1. `feed_items` — its read policy is `auth.role() = 'authenticated' and
--      published_at <= now()`, with no block test at all. Every announcement,
--      milestone and match card from a blocked person is visible.
--
--   2. `notifications` — the table has no actor column, so nothing can tell
--      which notifications are ABOUT whom. 0208 had to leave them alone for
--      exactly this reason. A block that hides someone everywhere except the
--      notification bell is not a block.
--
-- ── AND THE PREDICATE ITSELF WAS COPY-PASTED ─────────────────────────────
-- The same four-line `not exists (select 1 from blocks …)` appears inline in
-- 0001, 0099, 0142 and 0144. Four copies is four chances to write it one-sided,
-- and no way for a new surface to inherit it. It becomes one function.

-- ── 1. the canonical test already existed; it just was not reachable ──────
-- `is_blocked_pair(a, b)` has been in the schema since 0099 — correct, symmetric,
-- SECURITY DEFINER. It is granted to `service_role` ONLY, which is exactly why
-- four policies inline the predicate instead of calling it: `authenticated`
-- cannot execute it, so every RLS author had no choice but to write their own
-- copy. The duplication was a symptom of a missing grant, not a missing
-- abstraction, and adding one is what lets the copies collapse.
--
-- (I nearly shipped a second, identically-named function here. Searching the
-- migrations for the PATTERN found four inline copies; searching for the
-- FUNCTION would have found the original in one step.)
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

comment on function public.is_blocked_pair is
  'The single test for "these two must not see each other". SYMMETRIC by construction — a one-sided '
  'block reveals to the blocked person that they were blocked. Every surface calls this, so a new one '
  'inherits the rule instead of reimplementing it. Granted to authenticated (0209) so RLS policies can.';

-- ── 2. notifications learn who they are about ─────────────────────────────
alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

create index if not exists notifications_actor_idx
  on public.notifications (user_id, actor_id) where actor_id is not null;

-- Enforcement at the row boundary, not at the call site. There are dozens of
-- places that create notifications and there will be more; a rule that each of
-- them has to remember is a rule that will be forgotten. Dropping silently
-- rather than raising is deliberate: the action that triggered the notification
-- (someone commenting, someone finishing a match) is legitimate and must still
-- succeed — only the delivery is suppressed.
create or replace function public.drop_blocked_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_id is not null and public.is_blocked_pair(new.user_id, new.actor_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_block_filter on public.notifications;
create trigger notifications_block_filter
  before insert on public.notifications
  for each row execute function public.drop_blocked_notification();

-- ── 3. the feed projection stops showing blocked actors ───────────────────
drop policy if exists "feed read published" on public.feed_items;
create policy "feed read published" on public.feed_items
  for select to authenticated using (
    auth.role() = 'authenticated'
    and published_at <= now()
    and not public.is_blocked_pair(auth.uid(), actor_id)
  );

-- ── 4. posts and post_visible use the shared predicate ────────────────────
-- Same rule as before, expressed once. The behaviour is unchanged; what changes
-- is that there is now one place to fix if it is ever wrong.
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts
  for select to authenticated using (
    author_id = auth.uid()
    or (
      moderation_status = 'approved'
      and not public.is_blocked_pair(auth.uid(), posts.author_id)
      and (
        audience = 'public'
        or (
          audience in ('friends','followers')
          and exists (
            select 1 from public.friendships f
             where f.status = 'accepted'
               and ((f.requester_id = auth.uid() and f.addressee_id = posts.author_id)
                 or (f.addressee_id = auth.uid() and f.requester_id = posts.author_id))
          )
        )
        or (
          audience = 'followers'
          and exists (
            select 1 from public.follows fo
             where fo.follower_id = auth.uid() and fo.followee_id = posts.author_id
          )
        )
      )
    )
  );

create or replace function public.post_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_id
       and (
         p.author_id = auth.uid()
         or (
           p.moderation_status = 'approved'
           and not public.is_blocked_pair(auth.uid(), p.author_id)
           and (
             p.audience = 'public'
             or (
               p.audience in ('friends','followers')
               and exists (
                 select 1 from public.friendships f
                  where f.status = 'accepted'
                    and ((f.requester_id = auth.uid() and f.addressee_id = p.author_id)
                      or (f.addressee_id = auth.uid() and f.requester_id = p.author_id))
               )
             )
             or (
               p.audience = 'followers'
               and exists (
                 select 1 from public.follows fo
                  where fo.follower_id = auth.uid() and fo.followee_id = p.author_id
               )
             )
           )
         )
       )
  );
$$;

-- ── 5. blocking now purges the notifications too ──────────────────────────
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
  --   decline memo — a cooldown between two people with no relationship is stale
  delete from public.connection_declines where pair_lo = v_lo and pair_hi = v_hi;
  --   recommendations — neither is suggested to the other again
  delete from public.pymk_cache where user_id in (v_me, p_target);
  --   notifications — BOTH directions. The person who blocked should stop
  --   hearing about the other, and the blocked person should stop hearing about
  --   the blocker: a bell that goes quiet in only one direction is a signal.
  delete from public.notifications
   where (user_id = v_me and actor_id = p_target)
      or (user_id = p_target and actor_id = v_me);
end;
$$;

-- ── 6. keep it closed ─────────────────────────────────────────────────────
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
    );
$$;

revoke all on function public.social_invariants_intact() from public, anon, authenticated;
grant execute on function public.social_invariants_intact() to service_role;
