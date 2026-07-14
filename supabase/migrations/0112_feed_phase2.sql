-- 0112_feed_phase2.sql — Feed Phase 2 (FEED-ARCHITECTURE.md):
-- (1) Ranking-move cards: nightly rank_snapshots per sport (queue points) +
--     diff vs previous snapshot → feed 'ranking_move' when a member climbs
--     ≥5 places into the top 200 (region-scoped by their home ZIP).
-- (2) 0006 social revival: member posts flow into the feed as first-class
--     cards via triggers that honor the moderation lifecycle; likes power
--     the card's heart. Idempotent grants harden the 0006-era tables.
-- (3) actor_id index — the circle lane reads by connection.

-- ── 1) ranking snapshots + emitter ─────────────────────────────────────
create table if not exists public.rank_snapshots (
  snap_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport_key text not null,
  points integer not null,
  rank integer not null,
  primary key (snap_date, user_id, sport_key)
);
create index if not exists rank_snapshots_user_idx on public.rank_snapshots (user_id, sport_key, snap_date desc);

create or replace function public.snapshot_and_emit_ranking_moves()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare today date := current_date;
declare prev date;
begin
  -- today's standings: total ranked queue points per sport
  insert into public.rank_snapshots (snap_date, user_id, sport_key, points, rank)
  select today, t.user_id, t.sport_key, t.points,
         rank() over (partition by t.sport_key order by t.points desc)::int
  from (
    select user_id, sport_key, sum(points)::int as points
    from public.queue_points
    group by user_id, sport_key
    having sum(points) > 0
  ) t
  on conflict (snap_date, user_id, sport_key) do update
    set points = excluded.points, rank = excluded.rank;

  select max(snap_date) into prev from public.rank_snapshots where snap_date < today;
  if prev is null then return; end if;

  perform public.feed_emit(
    'ranking_move', cur.user_id, p.home_zip, 'ranking', cur.user_id,
    jsonb_build_object('sport', cur.sport_key, 'from', old.rank, 'to', cur.rank, 'climbed', old.rank - cur.rank),
    'ranking_move:' || cur.user_id || ':' || cur.sport_key || ':' || today,
    'region', cur.sport_key)
  from public.rank_snapshots cur
  join public.rank_snapshots old
    on old.snap_date = prev and old.user_id = cur.user_id and old.sport_key = cur.sport_key
  join public.profiles p on p.id = cur.user_id
  where cur.snap_date = today
    and cur.rank <= 200
    and old.rank - cur.rank >= 5
    and p.home_zip is not null;

  -- snapshots are a rolling baseline, not an archive
  delete from public.rank_snapshots where snap_date < today - interval '14 days';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'klimr-rank-snapshots') then
    perform cron.schedule('klimr-rank-snapshots', '30 16 * * *', 'select public.snapshot_and_emit_ranking_moves()');
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;

-- ── 2) member posts → feed (moderation-aware) ──────────────────────────
create or replace function public.feed_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare z text;
begin
  if tg_op = 'DELETE' then
    delete from public.feed_items where object_kind = 'post' and object_id = old.id;
    return null;
  end if;
  if new.moderation_status = 'approved' and (tg_op = 'INSERT' or old.moderation_status is distinct from 'approved') then
    select home_zip into z from public.profiles where id = new.author_id;
    if z is not null and new.body is not null then
      perform public.feed_emit('member_post', new.author_id, z, 'post', new.id,
        jsonb_build_object('body', left(new.body, 500)),
        'member_post:' || new.id, 'region', new.sport_key);
    end if;
  elsif tg_op = 'UPDATE' and new.moderation_status <> 'approved' and old.moderation_status = 'approved' then
    delete from public.feed_items where object_kind = 'post' and object_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists feed_post on public.posts;
create trigger feed_post after insert or update of moderation_status or delete on public.posts
  for each row execute function public.feed_on_post();

grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_comments to authenticated;

-- ── 3) circle-lane read index ───────────────────────────────────────────
create index if not exists feed_items_actor_idx on public.feed_items (actor_id, published_at desc) where actor_id is not null;
