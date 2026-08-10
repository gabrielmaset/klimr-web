-- 0212_social_outbox.sql — KCDX-031 (P1): social graph commit and notification
-- delivery are not durable together.
--
-- `requestConnection` calls `request_connection` (which commits the friendship)
-- and then calls `createNotification` as a separate operation. Between those two
-- lines the invocation can be reclaimed, the notification insert can fail, or the
-- process can be shut down mid-flight — and the graph edge exists while the
-- person it concerns is never told. Nothing detects it and nothing retries: there
-- is no record that a notification was owed.
--
-- The failure is quiet and permanent. Someone sends you a connection request,
-- the request is real and sitting in your invites, and you are never notified.
-- You find it weeks later, or not at all.
--
-- ── WHY AN OUTBOX RATHER THAN "JUST AWAIT IT PROPERLY" ───────────────────
-- Because the two writes are in different systems — one is a database
-- transaction, the other is a row created by a separate call — and no amount of
-- awaiting makes them atomic. The standard answer is to write the INTENT inside
-- the same transaction as the state change, and deliver from that record
-- afterwards. If the transaction commits, the intent exists; if it rolls back,
-- neither happened. Delivery can then fail and be retried without the graph and
-- the notification ever disagreeing.
--
-- Idempotency is the other half: an event carries a natural key, delivery is
-- attempted at most once per key, and a retry after a partial failure cannot
-- produce a second notification.

-- ── 0. FIVE NOTIFICATION KINDS THE APP SENDS AND THE DATABASE REJECTS ────
-- Found while testing the outbox below, and considerably worse than the finding
-- it was found under. `notifications_kind_check` allows eight kinds. The
-- application sends thirteen. Every insert with one of the other five violates
-- the constraint:
--
--   friend_request     1 site    app/network/actions.ts
--   friend_accept      2 sites   app/network/actions.ts
--   tournament         6 sites   substitutions, registrations, schedule changes
--   waitlist_offer     1 site    lib/match-waitlist.ts
--   waitlist_expired   1 site    lib/match-waitlist.ts
--
-- And `createNotification` wraps its insert in `catch { }` with the comment
-- "notifications are non-critical; don't block the triggering action" — which is
-- the right instinct and the wrong implementation, because supabase-js does not
-- throw on a constraint violation. It returns `{ error }`, which that code
-- ignores. So the failure is invisible twice over: swallowed if it threw, and it
-- does not even throw.
--
-- The consequence is plain. **Nobody has ever been notified of a connection
-- request.** Nor of a tournament substitution, a schedule change, or a waitlist
-- spot opening up — the last of which is time-critical by definition: the offer
-- expires whether or not the player was told it existed.
--
-- The kinds are legitimate product concepts with real call sites. The constraint
-- was simply never extended as features landed. Widening it is the fix; the app
-- code is correct.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'match_invite','match_join','match_confirm','ranking','region_challenge',
    'marketplace','sponsorship','system',
    -- added 0212, each with live call sites that had been failing silently
    'friend_request','friend_accept','tournament','waitlist_offer','waitlist_expired'
  ));

create table if not exists public.social_outbox (
  id            bigint generated always as identity primary key,
  -- The natural key. One event per (kind, actor, subject, edge state) — a retry
  -- or a duplicate trigger firing cannot create a second row, and therefore
  -- cannot create a second notification.
  dedupe_key    text not null unique,
  kind          text not null check (kind in ('connection_requested','connection_accepted')),
  actor_id      uuid not null references public.profiles(id) on delete cascade,
  subject_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  attempts      integer not null default 0,
  last_error    text
);

alter table public.social_outbox enable row level security;
grant all on public.social_outbox to service_role;
-- No member-facing policy: this is internal delivery state, not content.

create index if not exists social_outbox_pending_idx
  on public.social_outbox (created_at) where delivered_at is null;

-- ── the intent is written by the SAME transaction as the edge ─────────────
create or replace function public.emit_social_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_kind text; v_actor uuid; v_subject uuid;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_kind := 'connection_requested';
    v_actor := new.requester_id;
    v_subject := new.addressee_id;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    v_kind := 'connection_accepted';
    -- The person who accepted is the actor; the original requester is told.
    v_actor := new.addressee_id;
    v_subject := new.requester_id;
  else
    return new;
  end if;

  insert into public.social_outbox (dedupe_key, kind, actor_id, subject_id)
  values (v_kind || ':' || new.id::text, v_kind, v_actor, v_subject)
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists friendships_outbox on public.friendships;
create trigger friendships_outbox
  after insert or update of status on public.friendships
  for each row execute function public.emit_social_outbox();

-- ── delivery, retried and idempotent ──────────────────────────────────────
-- Claims a batch with FOR UPDATE SKIP LOCKED so two runs cannot deliver the same
-- event, writes the notification, and stamps the row. A failure leaves
-- `delivered_at` null and increments `attempts`, so the next run picks it up —
-- which is the property the old code did not have at all.
create or replace function public.deliver_social_outbox(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_name text; v_done integer := 0;
begin
  for r in
    select * from public.social_outbox
     where delivered_at is null and attempts < 10
     order by created_at
     limit p_limit
     for update skip locked
  loop
    begin
      select coalesce(display_name, 'A member') into v_name
        from public.profiles where id = r.actor_id;

      -- The notifications block trigger (0209) still applies: if the two people
      -- blocked each other between the request and delivery, the row is dropped
      -- there and the event is still marked delivered. That is correct — the
      -- delivery was attempted and the policy decided.
      insert into public.notifications (user_id, actor_id, kind, title, body, link_url)
      values (
        r.subject_id,
        r.actor_id,
        case when r.kind = 'connection_requested' then 'friend_request' else 'friend_accept' end,
        case when r.kind = 'connection_requested'
             then v_name || ' wants to connect'
             else v_name || ' accepted your connection request' end,
        case when r.kind = 'connection_requested'
             then 'Respond in your invites.'
             else 'You''re now connected on Klimr.' end,
        case when r.kind = 'connection_requested'
             then '/invites'
             else '/profile/' || r.actor_id::text end
      );

      update public.social_outbox
         set delivered_at = now(), attempts = attempts + 1, last_error = null
       where id = r.id;
      v_done := v_done + 1;
    exception when others then
      update public.social_outbox
         set attempts = attempts + 1, last_error = left(sqlerrm, 300)
       where id = r.id;
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.deliver_social_outbox(integer) from public, anon, authenticated;
grant execute on function public.deliver_social_outbox(integer) to service_role;

-- Every minute, in-database. Same reasoning as 0207: an HTTP cron route is one
-- middleware misclassification away from never running, and this is pure SQL.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      perform cron.unschedule('klimr-social-outbox');
    exception when others then null;
    end;
    perform cron.schedule('klimr-social-outbox', '* * * * *', 'select public.deliver_social_outbox()');
  end if;
end $$;

-- ── reconciliation: what did not get delivered ────────────────────────────
create or replace function public.social_outbox_stuck()
returns table (id bigint, kind text, created_at timestamptz, attempts integer, last_error text)
language sql
stable
security definer
set search_path = public
as $$
  select id, kind, created_at, attempts, last_error
    from public.social_outbox
   where delivered_at is null
     and (attempts >= 10 or created_at < now() - interval '1 hour')
   order by created_at;
$$;

revoke all on function public.social_outbox_stuck() from public, anon, authenticated;
grant execute on function public.social_outbox_stuck() to service_role;

comment on function public.social_outbox_stuck is
  'KCDX-031: events that committed with the graph edge but were never delivered. An empty result is the '
  'invariant; a non-empty one is the signal the old code could not produce at all.';
