-- 0238_ladder_enforcement.sql — makes the relationship/privacy ladder an enforced
-- boundary instead of a documented one.
--
-- KRA-008 (P1, re-audit 2026-08-10). 0233/0234 defined `may_act_on`,
-- `may_see_connections`, `may_see_schedule` and `comment_visible_to`, granted
-- them, and docs/RELATIONSHIP-PRIVACY-POLICY.md stated the rules were enforced.
-- A whole-tree search found **zero call sites**. The ladder was decorative: every
-- protected action was reachable through direct REST/RPC regardless of the
-- subject's setting, and `tests/doc-claims.test.ts` only proved the NAMES existed.
--
-- What was actually enforcing anything, and what it cost:
--   · invites  — 0144's `enforce_invite_privacy()` used a BINARY `open_to_invites`
--                flag and inlined ITS OWN copy of the block predicate.
--   · requests — `request_connection` (0208) inlined ANOTHER copy of the same
--                block predicate and consulted no setting at all.
--   · messages — the DM insert policy checked only that the peer was not the
--                caller. `who_can_message` defaults to `network` and was ignored
--                completely: any member could open a DM with any member.
--   · comments — insert checked authorship only; SELECT honoured moderation and
--                post visibility but never mute or restrict.
--   · tags     — insert checked that the tagger owned the post, nothing else.
--
-- Two inline copies of the block predicate is the same defect this codebase has
-- recorded four times: when a rule is re-implemented per surface, the surfaces
-- disagree. Both are deleted here in favour of the one predicate.
--
-- WHICH FORM EACH CALLER USES (this matters, and 0237 is why):
--   · RLS policies call the CALLER-BOUND wrapper `can_i_act_on(subject, action)`.
--     A policy expression is evaluated with the querying role's rights, and 0237
--     revoked member EXECUTE on the raw `may_act_on` — measured, not assumed.
--   · SECURITY DEFINER triggers and commands call `may_act_on(actor, subject,
--     action)` directly, because they run as the owner and must name an actor
--     that is not necessarily auth.uid().

-- ── 1. invites: the ladder replaces a boolean and an inline block copy ────
create or replace function public.enforce_invite_privacy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- `open_to_invites = false` is a hard "nobody" and outranks the ladder.
  -- NOTE FOR THE OWNER: Klimr now has TWO invite settings — this boolean (0144,
  -- from user_preferences.who_can_invite 'anyone'|'nobody') and the ladder's
  -- profiles.who_can_invite audience_level (0233). Both are enforced here, with
  -- the boolean as the stricter override. Collapsing them into one control is a
  -- product decision, recorded as follow-up rather than guessed at.
  if not coalesce((select open_to_invites from public.profiles where id = new.invited_user_id), true) then
    raise exception 'not open to invites';
  end if;

  -- One predicate. This replaces the inline `blocks` EXISTS that used to live
  -- here — `may_act_on` already refuses across a block in both directions, so
  -- the copy was both duplicated and narrower than the rule it stood for.
  if not public.may_act_on(new.invited_by, new.invited_user_id, 'invite') then
    raise exception 'not open to invites';
  end if;

  return new;
end $$;

-- ── 2. connection requests consult the ladder ────────────────────────────
-- Only the guard changes; every other branch of 0208's command is untouched.
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

  -- Was an inline `blocks` EXISTS. `may_act_on` covers the block in both
  -- directions AND applies the target's who_can_request level, which nothing
  -- consulted before — so a member set to `connections` was still reachable by
  -- any stranger through this command.
  if not public.may_act_on(v_me, p_target, 'request') then
    return 'blocked';
  end if;

  v_lo := least(v_me, p_target);
  v_hi := greatest(v_me, p_target);

  -- Serialize the canonical pair BEFORE the lookup (KCDX-027): a row-level
  -- `for update` only locks a row that already exists, which is not this race.
  perform pg_advisory_xact_lock(hashtextextended(v_lo::text || v_hi::text, 0));

  select * into v_row from public.friendships f
   where least(f.requester_id, f.addressee_id) = v_lo
     and greatest(f.requester_id, f.addressee_id) = v_hi
   for update;

  if found then
    if v_row.status = 'accepted' then return 'already_connected'; end if;
    if v_row.status = 'pending' then
      if v_row.addressee_id = v_me then
        update public.friendships set status = 'accepted', responded_at = now()
         where requester_id = v_row.requester_id and addressee_id = v_row.addressee_id;
        return 'accepted';
      end if;
      return 'already_requested';
    end if;
    if v_row.status = 'declined' then
      v_declined_at := v_row.responded_at;
      v_declined_by := case when v_row.addressee_id = v_me then v_me else v_row.addressee_id end;
      if v_declined_by <> v_me and v_declined_at is not null and v_declined_at > now() - interval '30 days' then
        return 'declined_recently';
      end if;
      delete from public.friendships
       where requester_id = v_row.requester_id and addressee_id = v_row.addressee_id;
    end if;
  end if;

  begin
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_me, p_target, 'pending');
    return 'requested';
  exception when unique_violation then
    -- Lost the race: re-read and take the reverse-accept path rather than
    -- reporting a request this member never made (KCDX-027).
    select * into v_row from public.friendships f
     where least(f.requester_id, f.addressee_id) = v_lo
       and greatest(f.requester_id, f.addressee_id) = v_hi
     for update;
    if found and v_row.status = 'pending' and v_row.addressee_id = v_me then
      update public.friendships set status = 'accepted', responded_at = now()
       where requester_id = v_row.requester_id and addressee_id = v_row.addressee_id;
      return 'accepted';
    end if;
    if found and v_row.status = 'accepted' then return 'already_connected'; end if;
    return 'already_requested';
  end;
end $$;

-- ── 3. direct messages honour who_can_message ────────────────────────────
-- LIVE BUG FOUND WHILE TESTING THIS, fixed here because otherwise the policy
-- below would be enforcing a rule on a path that cannot execute — and I would
-- have "proved" the deny case while the allow case was impossible.
--
-- 0075 added `conversations_one_anchor`: exactly one of match_id / team_id must
-- be set. 0110 then added direct messages, which have NEITHER — they are anchored
-- by `peer_id` with `kind = 'dm'` — and never relaxed the constraint. So every DM
-- insert has been rejected since 0110 shipped. `app/health/actions.ts` inserts
-- exactly that row shape, which means "Message this professional" in the health
-- directory has never worked once.
--
-- Same class as the two bugs 0201 repaired and the `marketplace_listings` status
-- CHECK that 0204 dropped: a constraint written before a feature existed, left
-- behind when the feature arrived, failing silently because the error was
-- swallowed by the caller.
--
-- `coalesce(kind, '')` matters: a CHECK that evaluates to NULL PASSES, so a null
-- `kind` on a legacy row would otherwise make the whole predicate NULL and let
-- an unanchored conversation through. Existing match/team rows still sum to 1.
alter table public.conversations drop constraint if exists conversations_one_anchor;
alter table public.conversations add constraint conversations_one_anchor
  check (
    (match_id is not null)::int
    + (team_id is not null)::int
    + (coalesce(kind, '') = 'dm' and peer_id is not null)::int
    = 1
  );

drop policy if exists conversations_dm_insert on public.conversations;
create policy conversations_dm_insert on public.conversations
  for insert with check (
    kind = 'dm'
    and created_by = auth.uid()
    and peer_id is not null
    and peer_id <> auth.uid()
    -- The whole finding, in one line: this check did not exist, so the default
    -- `network` setting meant nothing and any member could DM any member.
    and public.can_i_act_on(peer_id, 'message')
  );

-- ── 4. tagging honours who_can_tag ───────────────────────────────────────
drop policy if exists "author tags" on public.post_tags;
create policy "author tags" on public.post_tags
  for insert to authenticated with check (
    tagged_by = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
    and public.can_i_act_on(user_id, 'tag')
  );

-- ── 5. comments: who may write one, and who may see it ───────────────────
drop policy if exists "insert own comment" on public.post_comments;
create policy "insert own comment" on public.post_comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.post_visible(post_id)
    -- The subject of `comment` is the POST'S AUTHOR: their setting governs who
    -- may comment underneath them.
    and public.can_i_act_on(
      (select p.author_id from public.posts p where p.id = post_id), 'comment')
  );

-- Restrict is enforced on READ, and silently: a restricted person still sees
-- their own comment and the post owner still sees it, so neither is told.
-- `can_i_see_comment` is the caller-bound wrapper (0237). It is SECURITY DEFINER
-- and therefore reads post_comments as the owner, so calling it from this table's
-- own SELECT policy does not recurse.
drop policy if exists "comments readable" on public.post_comments;
create policy "comments readable" on public.post_comments
  for select to authenticated using (
    (moderation_status = 'approved' or author_id = auth.uid())
    and public.post_visible(post_id)
    and (author_id = auth.uid() or public.can_i_see_comment(id))
  );

-- ── 6. boundary sentinel ─────────────────────────────────────────────────
-- Asserts ENFORCEMENT, not vocabulary. The original finding was that the names
-- existed and nothing called them, and a test that only checked the names is
-- what let that stand — so each check below looks for the predicate inside the
-- policy or function that must apply it.
create or replace function public.ladder_enforced_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- DM insert applies who_can_message
    exists (select 1 from pg_policies where schemaname='public' and tablename='conversations'
              and policyname='conversations_dm_insert' and with_check like '%can_i_act_on%')
    -- tagging applies who_can_tag
    and exists (select 1 from pg_policies where schemaname='public' and tablename='post_tags'
              and policyname='author tags' and with_check like '%can_i_act_on%')
    -- commenting applies who_can_comment
    and exists (select 1 from pg_policies where schemaname='public' and tablename='post_comments'
              and policyname='insert own comment' and with_check like '%can_i_act_on%')
    -- comment reads apply mute and restrict
    and exists (select 1 from pg_policies where schemaname='public' and tablename='post_comments'
              and policyname='comments readable' and qual like '%can_i_see_comment%')
    -- a DM row shape is representable at all (the 0075/0110 constraint gap)
    and (select pg_get_constraintdef(oid) like '%dm%' from pg_constraint
          where conname = 'conversations_one_anchor' limit 1)
    -- invites and requests consult the ladder, and no longer inline `blocks`
    and (select pg_get_functiondef(p.oid) like '%may_act_on%'
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='enforce_invite_privacy' limit 1)
    and (select pg_get_functiondef(p.oid) like '%may_act_on%'
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='request_connection' limit 1);
$$;

revoke all on function public.ladder_enforced_intact() from anon, authenticated, public;
grant execute on function public.ladder_enforced_intact() to service_role;

-- ── 7. readiness floor moves with the new sentinel ───────────────────────
create or replace function public.klimr_ready(p_min_checks integer default 20)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
