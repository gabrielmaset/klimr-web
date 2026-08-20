-- 0116_feed_kind_check.sql — feed_items.kind was pinned by 0010 to the admin
-- composer's vocabulary ('announcement','news','result','update'); 0111/0112
-- added the automated emitters without widening it, so every trigger emission
-- violated feed_items_kind_check (second latent launch blocker the seed
-- caught, after 0115). Recreate the check with the full vocabulary: the four
-- curated kinds + every kind the emitters produce.

alter table public.feed_items drop constraint if exists feed_items_kind_check;

alter table public.feed_items
  add constraint feed_items_kind_check check (kind in (
    -- curated (admin composer, 0010)
    'announcement', 'news', 'result', 'update',
    -- automated emitters (0111)
    'player_joined', 'match_result', 'event_published', 'tournament_published',
    'gear_listed', 'pro_verified', 'team_formed',
    -- automated emitters (0112)
    'ranking_move', 'member_post'
  ));
