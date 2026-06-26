-- 0073_account_email_reconciliation.sql — when a Klimr account is created, attach any
-- email-keyed records (currently the waitlist) that match its address; and vice-versa
-- when such a record is created for an address that already has an account. Centralized
-- and extensible so future email-keyed concerns (banned emails, pre-issued invites, …)
-- slot into one function. All lookups are indexed email matches, so this scales — there
-- is no scan over the user base. Run AFTER 0072 (creates tournament_waitlist).

-- Scalable email-match lookups on the waitlist across all events.
create index if not exists tournament_waitlist_email_lower_idx
  on public.tournament_waitlist (lower(email))
  where email is not null;

-- ── Core reconciliation ──────────────────────────────────────────────────────
-- Attach every email-keyed record that matches this account's address. SECURITY
-- DEFINER so it can read auth + write app tables regardless of caller. Add new
-- email-keyed steps in the numbered section below as features are built.
create or replace function public.reconcile_account_email(p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(p_email, ''));
begin
  if v_email = '' then
    return;
  end if;

  -- 1) Waitlist — link unlinked email-only entries to this account, then let them
  --    know they can complete a full entry for a priority spot (active events only).
  with linked as (
    update public.tournament_waitlist w
       set user_id = p_user_id
     where w.user_id is null
       and w.email is not null
       and lower(w.email) = v_email
       and w.status in ('waiting', 'invited')
    returning w.tournament_id
  )
  insert into public.notifications (user_id, kind, title, body, link_url)
  select p_user_id,
         'system',
         'You''re on a waitlist — ' || t.title,
         'Complete your full entry to claim a priority spot.',
         '/e/' || t.code || '/signup'
    from linked l
    join public.tournaments t on t.id = l.tournament_id
   where t.status not in ('completed', 'cancelled', 'archived');

  -- 2) (Future) banned emails, pre-issued invites, etc. — add steps here.
end; $$;

revoke execute on function public.reconcile_account_email(uuid, text) from public, anon, authenticated;

-- ── Trigger: run reconciliation just after account creation ──────────────────
-- Separate from handle_new_user (which seeds the profile) for clean separation of
-- concerns. The trigger name extends on_auth_user_created, so it fires after it —
-- meaning the profile (which notifications.user_id references) already exists.
create or replace function public.on_account_created_reconcile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.reconcile_account_email(new.id, new.email);
  return new;
end; $$;

revoke execute on function public.on_account_created_reconcile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_reconcile on auth.users;
create trigger on_auth_user_created_reconcile
  after insert on auth.users
  for each row execute function public.on_account_created_reconcile();

-- ── Reverse direction: account already exists when the entry is created ──────
-- Link an email-only waitlist entry to a pre-existing account on the way in.
-- O(1) via auth's email index (GoTrue stores emails lowercased).
create or replace function public.link_waitlist_entry_to_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'email' and new.user_id is null and new.email is not null then
    select id into new.user_id from auth.users where email = lower(new.email) limit 1;
  end if;
  return new;
end; $$;

revoke execute on function public.link_waitlist_entry_to_account() from public, anon, authenticated;

drop trigger if exists trg_link_waitlist_to_account on public.tournament_waitlist;
create trigger trg_link_waitlist_to_account
  before insert on public.tournament_waitlist
  for each row execute function public.link_waitlist_entry_to_account();

-- ── One-time backfill: link existing email entries to existing accounts ──────
update public.tournament_waitlist w
   set user_id = u.id
  from auth.users u
 where w.user_id is null
   and w.kind = 'email'
   and w.email is not null
   and u.email = lower(w.email)
   and w.status in ('waiting', 'invited');
