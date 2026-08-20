-- ============================================================
-- 0004 — Remove Golf from the catalog (product scope change).
-- Run AFTER 0003. Safe to run more than once.
-- ============================================================

-- 1) Any golf matches go first (players/confirmations/disputes cascade).
delete from public.matches where sport_key = 'golf';

-- 2) Players whose PRIMARY sport was golf get their next sport promoted.
--    Golf-only players end with no primary and are routed back through the
--    profile wizard on their next visit — by design.
update public.profiles p
   set primary_sport = (
     select ps.sport_key
       from public.player_sports ps
      where ps.user_id = p.id and ps.sport_key <> 'golf'
      order by ps.sport_key
      limit 1)
 where p.primary_sport = 'golf';

-- 3) Golf ranking rows, then the sport itself.
delete from public.player_sports where sport_key = 'golf';
delete from public.sports where key = 'golf';
