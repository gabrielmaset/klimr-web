-- 0115_fix_feed_emit_conflict.sql — feed_emit's ON CONFLICT could not infer
-- the PARTIAL unique index (feed_items_dedupe_idx ... where dedupe_key is not
-- null): Postgres requires the arbiter clause to repeat the index predicate.
-- Latent since 0111; surfaced by the first profiles insert to fire
-- feed_on_profile (the dev seed) — any real signup would have hit it too.

create or replace function public.feed_emit(
  p_kind text, p_actor uuid, p_zip text, p_object_kind text, p_object_id uuid,
  p_meta jsonb, p_dedupe text, p_audience text default 'region', p_sport text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.feed_items (kind, body, sport_key, actor_id, zip, object_kind, object_id, meta, dedupe_key, audience, published_at)
  values (p_kind, '', p_sport, p_actor, p_zip, p_object_kind, p_object_id, coalesce(p_meta, '{}'::jsonb), p_dedupe, p_audience, now())
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
$$;
