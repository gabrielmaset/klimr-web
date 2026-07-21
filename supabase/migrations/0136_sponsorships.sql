-- 0136_sponsorships.sql — the sponsorship engine, launch-ready per decisions
-- #5/#6/#7/16. RECORDED-ONLY: Klimr stores the relationship and an optional
-- disclosed amount; NO money moves through the platform — amount_cents is a
-- matter of public record, never a charge. Targets from day one: event, team,
-- and PLAYER (surface ships "Coming soon"; the engine does not wait). Consent
-- mirrors tag consent: a sponsorship is PENDING until the target's controller
-- approves — event organizer, team creator, or the player themself. Category
-- policy is enforced here, not just in app code: a seeded policy table mirrors
-- lib/sponsorship-categories.ts; prohibited categories are refused outright,
-- and sponsoring at all requires an ACTIVE, TIER-2 business (sponsor-ready).

-- ---------- category policy (service-role-maintained mirror) ----------
create table if not exists public.sponsorship_categories (
  key text primary key,
  label text not null,
  tier text not null check (tier in ('prohibited','restricted')),
  updated_at timestamptz not null default now()
);
alter table public.sponsorship_categories enable row level security;
drop policy if exists sponsorship_categories_read on public.sponsorship_categories;
create policy sponsorship_categories_read on public.sponsorship_categories
  for select to authenticated using (true);
grant select on public.sponsorship_categories to authenticated;

insert into public.sponsorship_categories (key, label, tier) values
  ('gambling_betting', 'Gambling & sports betting', 'prohibited'),
  ('adult_content', 'Adult & sexual content', 'prohibited'),
  ('tobacco_nicotine', 'Tobacco, nicotine & vaping', 'prohibited'),
  ('illegal_drugs', 'Illegal & recreational drugs', 'prohibited'),
  ('weapons', 'Weapons, firearms & ammunition', 'prohibited'),
  ('predatory_finance', 'Payday & predatory lending', 'prohibited'),
  ('mlm_schemes', 'MLMs & get-rich-quick schemes', 'prohibited'),
  ('political', 'Political campaigns & advocacy', 'prohibited'),
  ('rx_pharma', 'Prescription pharmaceuticals', 'prohibited'),
  ('medical_claim_supplements', 'Supplements making medical claims', 'prohibited'),
  ('hate_extremism', 'Hate or extremist organizations', 'prohibited'),
  ('counterfeit', 'Counterfeit goods', 'prohibited'),
  ('speculative_crypto', 'Token offerings & speculative investments', 'prohibited'),
  ('alcohol', 'Alcohol', 'restricted'),
  ('cbd_hemp', 'CBD & hemp wellness', 'restricted'),
  ('licensed_finance', 'Licensed financial services', 'restricted'),
  ('energy_supplements', 'Energy drinks & claim-free supplements', 'restricted'),
  ('weight_loss', 'Weight-loss programs', 'restricted')
on conflict (key) do nothing;

-- sponsor businesses declare a category ('general' behavior when null)
alter table public.business_accounts
  add column if not exists category text references public.sponsorship_categories(key) on delete set null;

-- ---------- sponsorships ----------
create table if not exists public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_accounts(id) on delete cascade,
  target_kind text not null check (target_kind in ('event','team','player')),
  target_id uuid not null,
  label text not null default 'Sponsor',
  description text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'USD',
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'pending'
    check (status in ('pending','active','declined','ended')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (business_id, target_kind, target_id)
);
create index if not exists sponsorships_target_idx
  on public.sponsorships (target_kind, target_id) where status = 'active';
create index if not exists sponsorships_business_idx on public.sponsorships (business_id);

create table if not exists public.sponsorship_events (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete cascade,
  prev text,
  next text not null,
  actor uuid,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.sponsorship_events enable row level security;
-- no policies: service role / SECURITY DEFINER writers only

-- who controls a target?
create or replace function public._sponsorship_target_controller(p_kind text, p_target uuid, p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'player' then
    return p_target = p_uid;
  elsif p_kind = 'event' then
    return _liveness_is_organizer(p_target, p_uid);
  elsif p_kind = 'team' then
    return exists (select 1 from teams t where t.id = p_target and t.created_by = p_uid and t.deleted_at is null)
        or exists (select 1 from team_members tm where tm.team_id = p_target and tm.user_id = p_uid and tm.role = 'manager');
  end if;
  return false;
end; $$;
revoke all on function public._sponsorship_target_controller(text, uuid, uuid) from public, anon;
grant execute on function public._sponsorship_target_controller(text, uuid, uuid) to authenticated, service_role;

-- creation rules: sponsor-ready business, permitted category, target exists
create or replace function public.enforce_sponsorship_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_level text; v_status text; v_cat text; v_tier text; v_ok boolean;
begin
  select verification_level, status, category into v_level, v_status, v_cat
  from business_accounts where id = new.business_id;
  if not found then
    raise exception 'business_missing' using errcode = '23503';
  end if;
  if v_status <> 'active' or v_level <> 'tier2' then
    raise exception 'not_sponsor_ready' using errcode = '23514';
  end if;
  if v_cat is not null then
    select tier into v_tier from sponsorship_categories where key = v_cat;
    if v_tier = 'prohibited' then
      raise exception 'prohibited_category' using errcode = '23514';
    end if;
    -- restricted categories reach here only as tier2, which is the review gate
  end if;
  if new.target_kind = 'event' then
    select exists (select 1 from events e where e.id = new.target_id) into v_ok;
  elsif new.target_kind = 'team' then
    select exists (select 1 from teams t where t.id = new.target_id and t.deleted_at is null) into v_ok;
  else
    select exists (select 1 from profiles p where p.id = new.target_id) into v_ok;
  end if;
  if not v_ok then
    raise exception 'target_missing' using errcode = '23503';
  end if;
  if new.ends_on is not null and new.ends_on < new.starts_on then
    raise exception 'bad_dates' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists sponsorships_rules on public.sponsorships;
create trigger sponsorships_rules before insert on public.sponsorships
  for each row execute function public.enforce_sponsorship_rules();

create or replace function public._sponsorship_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into sponsorship_events (sponsorship_id, prev, next, actor, reason)
  values (new.id, null, new.status, auth.uid(), 'created');
  return new;
end; $$;
drop trigger if exists sponsorships_audit_insert on public.sponsorships;
create trigger sponsorships_audit_insert after insert on public.sponsorships
  for each row execute function public._sponsorship_audit();

-- ---------- transitions (SECURITY DEFINER, audited) ----------
create or replace function public.respond_sponsorship(p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s record; v_next text;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select id, target_kind, target_id, status into s from sponsorships where id = p_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if s.status <> 'pending' then return jsonb_build_object('error', 'already_responded'); end if;
  if not _sponsorship_target_controller(s.target_kind, s.target_id, v_uid) then
    return jsonb_build_object('error', 'not_controller');
  end if;
  v_next := case when p_accept then 'active' else 'declined' end;
  perform set_config('app.sponsorship_rpc', '1', true);
  update sponsorships set status = v_next, responded_at = now() where id = p_id;
  insert into sponsorship_events (sponsorship_id, prev, next, actor, reason)
  values (p_id, 'pending', v_next, v_uid, 'target_response');
  return jsonb_build_object('ok', true, 'status', v_next);
end; $$;

create or replace function public.end_sponsorship(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s record;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select id, business_id, target_kind, target_id, status into s from sponsorships where id = p_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if s.status <> 'active' then return jsonb_build_object('error', 'not_active'); end if;
  if not (is_business_manager(s.business_id, v_uid)
          or _sponsorship_target_controller(s.target_kind, s.target_id, v_uid)) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  perform set_config('app.sponsorship_rpc', '1', true);
  update sponsorships set status = 'ended', ends_on = least(coalesce(ends_on, current_date), current_date)
  where id = p_id;
  insert into sponsorship_events (sponsorship_id, prev, next, actor, reason)
  values (p_id, 'active', 'ended', v_uid, 'ended_by_party');
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.respond_sponsorship(uuid, boolean) to authenticated;
grant execute on function public.end_sponsorship(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.sponsorships enable row level security;
create policy "sponsorships readable" on public.sponsorships
  for select to authenticated using (
    status = 'active'
    or is_business_manager(business_id, auth.uid())
    or _sponsorship_target_controller(target_kind, target_id, auth.uid())
  );
create policy "business proposes" on public.sponsorships
  for insert to authenticated with check (
    created_by = auth.uid() and is_business_manager(business_id, auth.uid())
  );
-- status moves only through the RPCs above; while pending, managers may edit terms
create or replace function public.guard_sponsorship_update()
returns trigger language plpgsql as $$
begin
  if current_user <> 'service_role'
     and coalesce(current_setting('app.sponsorship_rpc', true), '') <> '1' then
    new.status := old.status;
    new.responded_at := old.responded_at;
  end if;
  if current_user <> 'service_role' then
    new.business_id := old.business_id;
    new.target_kind := old.target_kind;
    new.target_id := old.target_id;
  end if;
  return new;
end; $$;
drop trigger if exists sponsorships_guard on public.sponsorships;
create trigger sponsorships_guard before update on public.sponsorships
  for each row execute function public.guard_sponsorship_update();
create policy "managers edit pending" on public.sponsorships
  for update to authenticated
  using (status = 'pending' and is_business_manager(business_id, auth.uid()))
  with check (is_business_manager(business_id, auth.uid()));
create policy "managers withdraw pending" on public.sponsorships
  for delete to authenticated
  using (status = 'pending' and is_business_manager(business_id, auth.uid()));

grant select, insert, update, delete on public.sponsorships to authenticated;
