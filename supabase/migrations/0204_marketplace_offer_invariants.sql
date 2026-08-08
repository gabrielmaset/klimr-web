-- 0204_marketplace_offer_invariants.sql — KCDX-012 and KCDX-049 (P1).
--
-- ── KCDX-049: accepting an offer is not a listing-wide decision ──────────
-- `respondOffer` reads the offer, checks `status === "open"` in TypeScript, and
-- then issues an UNCONDITIONAL update keyed only on the offer id. Two sellers —
-- two tabs, two devices, or one impatient double-click — both read `open`, both
-- write `accepted`, and the listing now has two accepted offers. Nothing detects
-- it: `listing_offers_one_open` constrains one OPEN offer per buyer per listing,
-- which says nothing about how many may be accepted.
--
-- The listing then moves to `pending` in a separate statement, and competing
-- offers are never touched at all — so every other buyer's offer sits there
-- looking live on an item that is sold.
--
-- Accepting is a decision about the LISTING, not about one offer row, so the
-- listing is what gets locked. Under that lock: re-read the offer, compare and
-- swap on `status = 'open'`, expire the competitors, move the listing. One
-- transaction, one outcome.
--
-- ── KCDX-012: identity supplied by the client ───────────────────────────
-- `loadContext(listingId, buyerId)` takes the buyer from the caller and then
-- authorizes with `user.id !== buyerId && user.id !== sellerId`. A seller passes
-- that test for ANY buyerId, so a seller could create an offer attributed to
-- someone who never made one, bound to a conversation that is not that buyer's
-- thread. `convId` is likewise a client string.
--
-- None of it needs to be. `conversations (listing_id, created_by)` is unique, so
-- the thread follows from the listing and the buyer; and the buyer follows from
-- who is calling, or — for a seller's counter — from the parent offer. The
-- commands below derive every actor and binding from locked canonical rows and
-- accept no identity from the caller at all.

-- ── 0. a listing that can never leave 'active' ────────────────────────────
-- Found while testing the accept path, and not in the audit. `marketplace_listings`
-- carries TWO status CHECK constraints:
--
--   marketplace_listings_status_check   CHECK (status IN ('active','closed'))
--   marketplace_listings_status_check2  CHECK (status IN ('draft','active','pending','sold','expired','removed'))
--
-- Both must hold, so the effective vocabulary is their intersection: **'active'
-- and nothing else**. Marking a listing sold, moving it to pending on an accepted
-- offer, expiring it, removing it — every one of those raises a check violation
-- today. The first constraint is a leftover from the original two-state design
-- that was never dropped when the lifecycle grew.
--
-- This is why the accept path below can move a listing to 'pending' at all. Fixing
-- the offer race without this would have produced a command that looked correct
-- and failed at its last statement.
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_status_check;

-- ── 1. one accepted offer per listing ─────────────────────────────────────
-- Repair before constraining: if duplicates already exist, keep the earliest
-- decision and mark the rest declined. Nothing is deleted — a buyer whose
-- acceptance was reversed should be able to see that it happened.
with ranked as (
  select id, listing_id,
         row_number() over (partition by listing_id order by decided_at nulls last, created_at) as rn
    from public.listing_offers
   where status = 'accepted'
)
update public.listing_offers o
   set status = 'declined'
  from ranked r
 where o.id = r.id and r.rn > 1;

create unique index if not exists listing_offers_one_accepted
  on public.listing_offers (listing_id) where status = 'accepted';

-- ── 2. an offer's identity is not editable ────────────────────────────────
create or replace function public.freeze_offer_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.listing_id      := old.listing_id;
  new.buyer_id        := old.buyer_id;
  new.actor_id        := old.actor_id;
  new.amount_cents    := old.amount_cents;
  new.parent_offer_id := old.parent_offer_id;
  new.created_at      := old.created_at;
  return new;
end;
$$;

drop trigger if exists listing_offers_freeze_identity on public.listing_offers;
create trigger listing_offers_freeze_identity
  before update on public.listing_offers
  for each row execute function public.freeze_offer_identity();

-- ── 3. making an offer, with nothing taken from the caller ────────────────
create or replace function public.marketplace_offer_create(
  p_listing uuid,
  p_amount  integer default null,
  p_note    text    default null,
  p_parent  uuid    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_listing record;
  v_parent  record;
  v_buyer   uuid;
  v_conv    uuid;
  v_offer   uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  select * into v_listing from public.marketplace_listings where id = p_listing for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_listing.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'not_active'); end if;
  if v_listing.listed_by is null then return jsonb_build_object('ok', false, 'error', 'no_seller'); end if;

  if v_me = v_listing.listed_by then
    -- A seller does not open an offer; they counter one. The buyer therefore
    -- comes from the parent row, never from a parameter.
    if p_parent is null then return jsonb_build_object('ok', false, 'error', 'seller_needs_parent'); end if;
    select * into v_parent from public.listing_offers where id = p_parent for update;
    if not found or v_parent.listing_id <> p_listing then
      return jsonb_build_object('ok', false, 'error', 'bad_parent');
    end if;
    v_buyer := v_parent.buyer_id;
  else
    v_buyer := v_me;
    if p_parent is not null then
      select * into v_parent from public.listing_offers where id = p_parent for update;
      if not found or v_parent.listing_id <> p_listing or v_parent.buyer_id <> v_buyer then
        return jsonb_build_object('ok', false, 'error', 'bad_parent');
      end if;
    end if;
  end if;

  if exists (select 1 from public.listing_offers
              where listing_id = p_listing and status = 'accepted') then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  -- Superseding, not stacking: a new offer in a thread replaces the open one.
  update public.listing_offers
     set status = 'withdrawn', decided_at = now()
   where listing_id = p_listing and buyer_id = v_buyer and status = 'open';

  insert into public.listing_offers (listing_id, buyer_id, actor_id, amount_cents, note, parent_offer_id)
  values (p_listing, v_buyer, v_me, p_amount, nullif(btrim(coalesce(p_note, '')), ''), p_parent)
  returning id into v_offer;

  -- The thread is derivable — `conversations (listing_id, created_by)` is unique —
  -- so it is never a caller-supplied string.
  select id into v_conv from public.conversations
   where listing_id = p_listing and created_by = v_buyer;

  return jsonb_build_object('ok', true, 'offer_id', v_offer, 'buyer_id', v_buyer,
                            'seller_id', v_listing.listed_by, 'conversation_id', v_conv);
end;
$$;

-- ── 4. responding, as a decision about the listing ────────────────────────
create or replace function public.marketplace_offer_respond(
  p_offer  uuid,
  p_accept boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_offer   record;
  v_listing record;
  v_conv    uuid;
  v_rows    int;
  v_expired int;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- Read the offer only to find its listing; the LISTING is the contended
  -- resource and therefore the thing that gets locked first.
  select listing_id into v_offer from public.listing_offers where id = p_offer;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select * into v_listing from public.marketplace_listings where id = v_offer.listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'listing_gone'); end if;

  -- Now re-read the offer under the listing lock. Anything decided between the
  -- two reads is visible here.
  select * into v_offer from public.listing_offers where id = p_offer for update;

  if v_me <> v_offer.buyer_id and v_me <> v_listing.listed_by then
    return jsonb_build_object('ok', false, 'error', 'not_your_thread');
  end if;
  if v_offer.actor_id = v_me then return jsonb_build_object('ok', false, 'error', 'your_own_offer'); end if;
  if v_offer.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'not_open', 'status', v_offer.status); end if;
  if v_offer.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;

  -- Compare and swap. The TypeScript status check above the old UPDATE was a
  -- read; this is the write refusing to happen twice.
  update public.listing_offers
     set status = case when p_accept then 'accepted' else 'declined' end,
         decided_at = now()
   where id = p_offer and status = 'open';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then return jsonb_build_object('ok', false, 'error', 'race_lost'); end if;

  v_expired := 0;
  if p_accept then
    -- Every other live offer on this listing is now moot. Leaving them open is
    -- how a buyer keeps waiting on an item that is sold.
    update public.listing_offers
       set status = 'expired', decided_at = now()
     where listing_id = v_listing.id and id <> p_offer and status = 'open';
    get diagnostics v_expired = row_count;

    if v_listing.status = 'active' then
      update public.marketplace_listings set status = 'pending' where id = v_listing.id;
    end if;
  end if;

  select id into v_conv from public.conversations
   where listing_id = v_listing.id and created_by = v_offer.buyer_id;

  return jsonb_build_object(
    'ok', true,
    'decision', case when p_accept then 'accepted' else 'declined' end,
    'offer_id', p_offer, 'listing_id', v_listing.id, 'listing_title', v_listing.title,
    'buyer_id', v_offer.buyer_id, 'seller_id', v_listing.listed_by,
    'notify_user_id', v_offer.actor_id, 'conversation_id', v_conv,
    'competitors_expired', v_expired);
end;
$$;

revoke all on function public.marketplace_offer_create(uuid, integer, text, uuid) from public, anon;
revoke all on function public.marketplace_offer_respond(uuid, boolean) from public, anon;
grant execute on function public.marketplace_offer_create(uuid, integer, text, uuid) to authenticated, service_role;
grant execute on function public.marketplace_offer_respond(uuid, boolean) to authenticated, service_role;

-- ── 5. keep it closed ─────────────────────────────────────────────────────
create or replace function public.offer_invariants_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from pg_indexes where indexname = 'listing_offers_one_accepted')
    and exists (
      select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'listing_offers' and t.tgname = 'listing_offers_freeze_identity'
         and not t.tgisinternal and t.tgenabled <> 'D'
    )
    and not exists (
      select 1 from public.listing_offers
       group by listing_id having count(*) filter (where status = 'accepted') > 1
    );
$$;

revoke all on function public.offer_invariants_intact() from public, anon, authenticated;
grant execute on function public.offer_invariants_intact() to service_role;
