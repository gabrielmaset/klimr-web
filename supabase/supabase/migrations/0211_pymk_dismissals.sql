-- 0211_pymk_dismissals.sql — KCDX-029 (P1): PYMK invalidation and dismissal are
-- incomplete.
--
-- Three separate holes, and the first is the one members feel:
--
--  1. DISMISSAL IS REACT STATE. `pymk-rail.tsx` implements ✕ as
--     `setRows(xs => xs.filter(...))`. Nothing is persisted. Refresh the page and
--     the person you just dismissed is back, in the same rail, forever. The
--     comment in that file says "dismisses for this visit" — it is honest about
--     what it does, which does not make it the right behaviour.
--
--  2. THE CACHE IS SERVED WITHOUT RECHECKING ANYTHING. `getPeopleYouMayKnow`
--     returns a 24-hour-old payload whenever it is fresh. In that window the
--     suggested person may have been blocked, deactivated their account, or
--     already become your connection — and the rail will keep offering them,
--     with a Connect button that now fails. A block that hides someone
--     everywhere except the friend suggestions is the same defect as a block
--     that hides them everywhere except the notification bell.
--
--  3. INVALIDATION IS PARTIAL. The cache is cleared on accept and on block. It
--     is not cleared when someone deactivates, when a request is declined, or
--     when the underlying affinities are recomputed nightly.
--
-- The fix for (1) is a table. The fix for (2) and (3) is to stop relying on
-- invalidation being complete — the serving path revalidates the identities in
-- SQL before they are shown, so a stale cache can be wrong without being harmful.
-- Invalidation is an optimisation; the recheck is the guarantee.

-- ── 1. dismissals that survive a refresh ──────────────────────────────────
-- Expiring, deliberately. "Not right now" and "never" are different answers, and
-- a permanent hide from one tap is a decision the member did not make. Ninety
-- days is long enough that the rail stops feeling repetitive, short enough that
-- a suggestion which became relevant later can return.
create table if not exists public.pymk_dismissals (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  dismissed_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '90 days',
  primary key (user_id, dismissed_id)
);

alter table public.pymk_dismissals enable row level security;

create policy pymk_dismissals_own on public.pymk_dismissals
  for select to authenticated using (user_id = auth.uid());

grant select on public.pymk_dismissals to authenticated;
grant all on public.pymk_dismissals to service_role;

-- Plain index, not partial: `now()` is not IMMUTABLE so it cannot appear in an
-- index predicate. The expiry is filtered at query time instead, which costs
-- nothing here — the row count per user is tiny by construction.
create index if not exists pymk_dismissals_live_idx
  on public.pymk_dismissals (user_id, expires_at);

create or replace function public.pymk_dismiss(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or p_target is null or p_target = v_me then return; end if;

  insert into public.pymk_dismissals (user_id, dismissed_id, dismissed_at, expires_at)
  values (v_me, p_target, now(), now() + interval '90 days')
  on conflict (user_id, dismissed_id)
  do update set dismissed_at = now(), expires_at = now() + interval '90 days';

  -- Drop the cached payload so the rail does not re-render the person from a
  -- snapshot taken before the dismissal.
  delete from public.pymk_cache where user_id = v_me;
end;
$$;

revoke all on function public.pymk_dismiss(uuid) from public, anon;
grant execute on function public.pymk_dismiss(uuid) to authenticated, service_role;

-- ── 2. the recheck that makes a stale cache safe ──────────────────────────
-- Given the identities in a cached payload, return only those that are STILL
-- suggestible right now. Every predicate that should have invalidated the cache
-- is evaluated here instead, so the correctness does not depend on remembering
-- to invalidate — which is what (3) shows we do not reliably do.
create or replace function public.pymk_valid_targets(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.id = any(p_ids)
     and p.id <> auth.uid()
     -- the account is still usable
     and p.account_status = 'active'
     -- neither has blocked the other
     and not public.is_blocked_pair(auth.uid(), p.id)
     -- not dismissed within the window
     and not exists (
       select 1 from public.pymk_dismissals d
        where d.user_id = auth.uid() and d.dismissed_id = p.id and d.expires_at > now()
     )
     -- and there is no relationship already, in either direction or either state
     and not exists (
       select 1 from public.friendships f
        where least(f.requester_id, f.addressee_id) = least(auth.uid(), p.id)
          and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p.id)
     );
$$;

revoke all on function public.pymk_valid_targets(uuid[]) from public, anon;
grant execute on function public.pymk_valid_targets(uuid[]) to authenticated, service_role;

comment on function public.pymk_valid_targets is
  'KCDX-029: filters cached PYMK identities against live predicates (active, not blocked, not dismissed, '
  'not already related) before they are shown. Invalidation is an optimisation; this is the guarantee.';

-- ── 3. deactivation clears the caches that named you ──────────────────────
-- One of the invalidation paths that was missing. Cheap, and it keeps the rail
-- honest between recomputes even for viewers who never revisit.
create or replace function public.clear_pymk_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status and new.account_status <> 'active' then
    delete from public.pymk_cache where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_pymk on public.profiles;
create trigger profiles_clear_pymk
  after update of account_status on public.profiles
  for each row execute function public.clear_pymk_on_deactivate();
