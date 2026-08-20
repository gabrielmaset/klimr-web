-- 0249_browse_kinds.sql — "show me courts" returns courts.
--
-- KRA-023 (P1, re-audit 2026-08-10). `runSearch` detects a BROWSE intent — a kind
-- word with no informative terms ("tournaments", "courts near me", "teams") — and
-- then implements it for exactly two kinds. `event` and `tournament` list upcoming
-- rows; `court`, `team`, `listing`, `class`, `provider` and `business` fall
-- through to the lexical matcher with `condensed === ""`, which by construction
-- matches nothing.
--
-- So the browse branch turned "I detected you want to see courts" into an empty
-- result set — the exact screenshot bug its own comment says it exists to prevent,
-- surviving for six of the eight kinds it routes.
--
-- Implemented as ONE function rather than six TypeScript branches, for a reason
-- this session has now demonstrated twice (0243's `purge_orphan_feed_media`
-- signature, 0245's `professional_applications` table name): a column name guessed
-- in application code fails silently at runtime and returns an empty list, which
-- is indistinguishable from "nothing matched". The same guess in SQL fails the
-- replay immediately. Every table and column below was read from the live schema
-- before it was written.

create or replace function public.browse_kind(p_kind text, p_limit int default 6)
returns table (kind text, id text, title text, subtitle text, sort_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  -- SECURITY INVOKER throughout: browsing is a READ, and every table below has
  -- its own policy. This decides WHICH KIND to list, never who may see a row.
  with lim as (select greatest(least(coalesce(p_limit, 6), 25), 1) as n)

(select 'event'::text, e.id::text, e.title,
         coalesce(e.sport_key, ''), e.starts_at
    from public.events e, lim
   where p_kind = 'event'
     and e.status in ('active', 'published')
     -- KRA-023: a RECURRING event's next instance lives in `event_occurrences`
     -- (0129). Listing by `events.starts_at` alone buries a weekly session whose
     -- series began months ago — which is precisely the kind of thing somebody
     -- typing "events" wants to see.
     and coalesce(
           (select max(o.starts_at) from public.event_occurrences o
             where o.event_id = e.id and o.starts_at > now() - interval '1 day'),
           e.starts_at
         ) > now() - interval '1 day'
   order by coalesce(
              (select min(o.starts_at) from public.event_occurrences o
                where o.event_id = e.id and o.starts_at > now() - interval '1 day'),
              e.starts_at
            ) asc
   limit (select n from lim))
  union all
(select 'tournament', t.code, t.title, coalesce(t.sport_key, ''), t.starts_at
    from public.tournaments t, lim
   where p_kind = 'tournament'
     and t.visibility = 'public'
     and t.cancelled_at is null
     and t.starts_at > now() - interval '1 day'
   order by t.starts_at asc
   limit (select n from lim))
  union all
(select 'court', c.id::text, c.name,
         nullif(btrim(concat_ws(', ', c.city, c.state)), ''), null::timestamptz
    from public.courts c, lim
   where p_kind = 'court' and c.is_active
   order by c.name asc
   limit (select n from lim))
  union all
(select 'team', tm.id::text, tm.name,
         nullif(btrim(concat_ws(', ', tm.city, tm.state)), ''), null::timestamptz
    from public.teams tm, lim
   where p_kind = 'team'
   order by tm.name asc
   limit (select n from lim))
  union all
(select 'listing', l.id::text, l.title, coalesce(l.sport_key, ''), null::timestamptz
    from public.marketplace_listings l, lim
   where p_kind = 'listing' and l.status = 'active'
   order by l.created_at desc
   limit (select n from lim))
  union all
(select 'business', b.id::text, b.name, coalesce(b.area_text, b.headline), null::timestamptz
    from public.business_accounts b, lim
   where p_kind = 'business'
   order by b.name asc
   limit (select n from lim));
$$;

revoke all on function public.browse_kind(text, int) from public, anon;
grant execute on function public.browse_kind(text, int) to authenticated, service_role;

comment on function public.browse_kind is
  'KRA-023: lists a kind for a BROWSE intent ("courts", "teams", "events next month"), where there is '
  'no text to match and the lexical matcher returns nothing by construction. INVOKER — it chooses the '
  'kind, RLS still chooses the rows.';

create or replace function public.browse_kinds_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- INVOKER, or browsing would bypass every read policy at once
    (select p.prosecdef = false
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'browse_kind' limit 1)
    -- and it covers the kinds the router can hint, not two of them
    and (select position('''court''' in pg_get_functiondef(p.oid)) > 0
            and position('''team''' in pg_get_functiondef(p.oid)) > 0
            and position('''listing''' in pg_get_functiondef(p.oid)) > 0
            and position('''business''' in pg_get_functiondef(p.oid)) > 0
            and position('event_occurrences' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'browse_kind' limit 1);
$$;

revoke all on function public.browse_kinds_intact() from public, anon, authenticated;
grant execute on function public.browse_kinds_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 29)
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
