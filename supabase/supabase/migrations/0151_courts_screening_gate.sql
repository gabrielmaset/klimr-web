-- 0151_courts_screening_gate.sql — the finder shows only screened listings.
-- Root cause of the "fake court" bug: migrations 0015/0028 hand-seeded courts
-- (approximate coords, no Google backing, never player-confirmed). The
-- footnote has always promised "every listing is confirmed by a Klimr player
-- before it appears" — this migration ENFORCES it at the database:
--   is_active — the visibility switch. Unscreened rows (no google_place_id
--   AND no confirmed_at) are deactivated; Google-backed and confirmed rows
--   stay. Re-adding a real place via the suggest flow reactivates naturally
--   (new rows default true and carry a place_id).
-- Also: LIVE QUEUE now requires a session activated in the last 12 hours —
-- a never-ended test session from weeks ago can no longer light the pill.
-- Busy-history is untouched (it reads queue_matches, all ages).
-- Plus courts_scan_log for the coverage gap-fill (one Google scan per
-- zip+sport per 30 days). courts_finder recreated VERBATIM from 0148 with
-- exactly the three edits above. Idempotent.

alter table public.courts add column if not exists is_active boolean not null default true;

update public.courts set is_active = false
where google_place_id is null and confirmed_at is null;

update public.courts set is_active = true
where confirmed_at is not null or google_place_id is not null;

create index if not exists courts_active_idx on public.courts (is_active) where is_active;

create table if not exists public.courts_scan_log (
  zip text not null,
  sport text not null,
  scanned_at timestamptz not null default now(),
  primary key (zip, sport)
);
alter table public.courts_scan_log enable row level security;

drop function if exists public.courts_finder(double precision, double precision, double precision);
create function public.courts_finder(
  p_lat double precision,
  p_lng double precision,
  p_radius_mi double precision
) returns table (
  id uuid,
  name text,
  area text,
  city text,
  lat double precision,
  lng double precision,
  sports text[],
  court_count int,
  indoor boolean,
  lights boolean,
  free boolean,
  google_rating numeric,
  google_rating_count int,
  member_rating numeric,
  member_review_count int,
  live_queue boolean,
  active_player_count int,
  recent_players jsonb,
  busy text,
  distance_mi double precision
)
language sql stable security definer set search_path = public as $$
with origin as (
  select p_lat as lat, p_lng as lng, greatest(0.5, least(50, p_radius_mi)) as r
),
in_radius as (
  select c.*,
         (3958.8 * acos(least(1, greatest(-1,
            cos(radians(o.lat)) * cos(radians(c.lat)) * cos(radians(c.lng) - radians(o.lng))
          + sin(radians(o.lat)) * sin(radians(c.lat))
         )))) as distance_mi
  from courts c, origin o
  where c.lat is not null and c.lng is not null and c.is_private = false and c.is_active
),
hits as (
  select ir.* from in_radius ir, origin o where ir.distance_mi <= o.r
),
-- a live-queue session belongs to a court via its event, or by proximity
linked_sessions as (
  select h.id as court_id, s.id as session_id, s.ended_at, s.activated_at
  from hits h
  join court_sessions s
    on (
      s.court_id = h.id
      or exists (select 1 from events e where e.id = s.event_id and e.court_id = h.id)
      or (
        s.center_lat is not null and s.center_lng is not null
        and (3958.8 * acos(least(1, greatest(-1,
              cos(radians(s.center_lat)) * cos(radians(h.lat)) * cos(radians(h.lng) - radians(s.center_lng))
            + sin(radians(s.center_lat)) * sin(radians(h.lat))
           )))) <= 0.15
      )
    )
),
live as (
  select court_id, true as live_queue
  from linked_sessions
  where ended_at is null
    and activated_at > now() - interval '12 hours'
  group by court_id
),
reviews as (
  select r.court_id, avg(r.rating)::numeric(3,2) as member_rating, count(*)::int as member_review_count
  from court_reviews r
  join hits h on h.id = r.court_id
  group by r.court_id
),
checkin_stats as (
  select k.court_id, count(distinct k.user_id)::int as active_player_count
  from court_checkins k
  join hits h on h.id = k.court_id
  where k.created_at >= now() - interval '90 days'
  group by k.court_id
),
recent as (
  select court_id,
         jsonb_agg(jsonb_build_object('id', user_id, 'name', display_name, 'hue', avatar_hue)
                   order by last_seen desc) as recent_players
  from (
    select k.court_id, k.user_id, p.display_name, coalesce(p.avatar_hue, 200) as avatar_hue,
           max(k.created_at) as last_seen,
           row_number() over (partition by k.court_id order by max(k.created_at) desc) as rn
    from court_checkins k
    join hits h on h.id = k.court_id
    join profiles p on p.id = k.user_id
    where k.created_at >= now() - interval '90 days'
    group by k.court_id, k.user_id, p.display_name, p.avatar_hue
  ) x
  where rn <= 3
  group by court_id
),
-- busy: this court's 8-week hour-of-week distribution vs the current slot
match_how as (
  select ls.court_id,
         (extract(dow from qm.started_at)::int * 24 + extract(hour from qm.started_at)::int) as how
  from linked_sessions ls
  join queue_matches qm on qm.session_id = ls.session_id
  where qm.started_at >= now() - interval '56 days'
),
per_slot as (
  select c.court_id, s.how, count(m.how)::numeric as n
  from (select distinct court_id from match_how) c
  cross join generate_series(0, 167) as s(how)
  left join match_how m on m.court_id = c.court_id and m.how = s.how
  group by c.court_id, s.how
),
busy_calc as (
  select court_id,
         sum(n) as total,
         max(n) filter (where how = (extract(dow from now())::int * 24 + extract(hour from now())::int)) as now_n,
         percentile_cont(0.7) within group (order by n) as p70,
         percentile_cont(0.3) within group (order by n) as p30
  from per_slot
  group by court_id
)
select
  h.id, h.name,
  coalesce(h.neighborhood, h.city) as area,
  h.city,
  h.lat, h.lng, h.sports, h.court_count, h.indoor, h.lights, h.free,
  h.rating as google_rating,
  h.rating_count as google_rating_count,
  rv.member_rating,
  coalesce(rv.member_review_count, 0) as member_review_count,
  coalesce(lv.live_queue, false) as live_queue,
  coalesce(cs.active_player_count, 0) as active_player_count,
  coalesce(rc.recent_players, '[]'::jsonb) as recent_players,
  case
    when bc.total is null or bc.total < 12 then null
    when bc.now_n >= bc.p70 and bc.now_n > 0 then 'BUSY'
    when bc.now_n <= bc.p30 then 'QUIET'
    else 'MODERATE'
  end as busy,
  h.distance_mi
from hits h
left join live lv on lv.court_id = h.id
left join reviews rv on rv.court_id = h.id
left join checkin_stats cs on cs.court_id = h.id
left join recent rc on rc.court_id = h.id
left join busy_calc bc on bc.court_id = h.id
order by h.distance_mi asc
limit 200;
$$;

revoke all on function public.courts_finder(double precision, double precision, double precision) from public;
grant execute on function public.courts_finder(double precision, double precision, double precision) to authenticated;
