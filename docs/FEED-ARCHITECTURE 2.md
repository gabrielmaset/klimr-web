# Klimr Feed — Living-Feed Architecture

*Status: designed 2026-07-13 · Phase 1 ready to build · depends on migration 0111 (drafted below)*

## 1. What the feed is today (recon)

- **`app/feed/page.tsx`** is the real feed (the marketing landing at `/` is separate): it renders
  the viewer's **next-match hero** (matches + team_matches + court/opponent lookups), **3 upcoming
  events**, and a list of **`feed_items`** (limit 40) — a table that already exists (migration 0010)
  but has exactly **one writer**: the admin composer (`app/admin/actions.ts`). So today the feed is
  the *Klimr operational-communications channel* plus personal match context — nothing else on the
  site writes into it.
- **`0006_social_feed.sql`** (posts/likes/comments) is dormant — reserved for the member-social
  phase; the feed page doesn't read it.
- Everything else the feed *should* know about already exists as first-class data: `profiles`
  (home_zip, city, primary_sport) for new players; `queue_points` / `tournament_points` for
  results and standings movement; `events` + `tournaments` publish states; `marketplace_listings`;
  `class_providers` approvals; `teams`.
- Realtime precedent is established (dm-room, marketplace-room, chats-live-refresher all subscribe
  to `postgres_changes`).

**The gap is writers, region, and liveness — not readers.** The page, the table, and the design
language all exist.

## 2. The architecture: one stream, three writer classes

A single append-only `feed_items` stream, extended with actor/region/object columns. No per-user
inboxes. This is deliberate: Klimr's feed is a **region-scoped broadcast**, not a follower graph.
Industry framing: fan-out-on-write buys O(1) reads at the cost of one write per follower;
fan-out-on-read buys single writes at the cost of merge-at-read. Because a Klimr item's audience
is "everyone near ZIP X" rather than "the author's N followers," **one row serves the whole
audience** — we get push-model read speed with pull-model write cost, and the celebrity fan-out
problem cannot exist here. When member-to-member follows arrive (0006 revival), that lane makes
the write/read decision separately.

### Writer class 1 — Curated (exists)
The admin composer keeps writing `kind: system/news` items, now with `audience: 'global'`.
Nothing changes for Gabriel's workflow.

### Writer class 2 — Automated DB triggers (new, migration 0111)
SECURITY DEFINER trigger functions, AFTER INSERT/UPDATE on the source tables — set-based, no app
round-trips, per the house scale mandate. Inventory:

| Source | Fires on | Feed kind | Audience | Notes |
|---|---|---|---|---|
| `profiles` | INSERT (with home_zip) | `player_joined` | region | Name + primary sport only (privacy) |
| `queue_points` | INSERT | `match_result` | region | `dedupe_key = 'match:'||match_id` collapses per-player rows |
| `events` | status → active/published | `event_published` | region | Title + sport + link `/events/...` |
| `tournaments` | first public publish | `tournament_published` | region | Link `/e/{code}` |
| `marketplace_listings` | INSERT active | `gear_listed` | region | Title + price |
| `class_providers` | status → approved | `pro_verified` | region (area) / global (virtual) | "A verified dietitian joined" |
| `teams` | INSERT | `team_formed` | region | Crest colors render client-side |

**Ranking climbs are Phase 2**: detecting "went way up" requires a baseline, so P2 adds
`rank_snapshots` (zip × sport × user × rank, written nightly by pg_cron) and an
`emit_ranking_moves()` job that feeds `ranking_move` items when a member jumps ≥N places in their
ZIP's standings. P1 already carries the ingredient (`match_result` items show points earned).

### Writer class 3 — App-level seam (new)
`lib/feed.ts` → `publishFeedItem()` mirroring `lib/notify`, for cases triggers can't express
(multi-table conditions, service-role contexts). **Feature Integration Checklist gains a
"feed emission" line** — every future feature declares whether it emits.

## 3. Schema — migration 0111 (draft)

```sql
alter table public.feed_items
  add column if not exists actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists zip text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists object_kind text,
  add column if not exists object_id text,
  add column if not exists dedupe_key text,
  add column if not exists audience text not null default 'region'
    check (audience in ('region','global'));

create unique index if not exists feed_items_dedupe on public.feed_items (dedupe_key)
  where dedupe_key is not null;
create index if not exists feed_items_time on public.feed_items (published_at desc);
create index if not exists feed_items_zip on public.feed_items (zip, published_at desc);
```

Design notes (research-aligned): audience/region leads the read pattern so it leads the indexes;
titles/bodies are denormalized onto the row at write time so feed reads never join; lat/lng are
denormalized **now** so the Phase-2 upgrade to bounding-box SQL is a query change, not a
migration; `dedupe_key` makes every emitter idempotent. Writes remain trigger/service-only
(no new INSERT grants); the existing authenticated SELECT stands.

## 4. Read model

Viewer's `home_zip` → lat/lng (existing ZIP lookup) → fetch the latest ~80 items → keep
`audience='global'` plus region items within **25 mi** (JS haversine in v1; the indexed
bounding-box `WHERE` clause replaces it when volume demands — columns already in place). Blocked
members' items are filtered read-time via the 0099 graph. Client-side **24-hour collapse** of
same-kind/same-zip runs ("3 new players in Mar Vista this week") uses the time-windowed grouping
approach standard for read-time aggregation; server-side pre-aggregation is the Phase-2 escalation
if volume warrants.

## 5. Liveness

Realtime subscription on `feed_items` INSERTs → a **"New updates" pill** at the top of the feed;
tapping refreshes. Content never inserts itself under the reader mid-scroll — the
banner-and-let-them-choose pattern is what successful feed products converge on precisely because
silent insertion shifts content while people read. (Precedent in-house: chats-live-refresher.)

## 6. Privacy, safety, retention

- Only **public objects** emit (published events/tournaments, active listings, approved pros).
- `player_joined` carries name + primary sport only — no ZIP text shown, just proximity scoping.
- Respect blocks read-time; deleting a source object deletes its feed row (FK/object cleanup).
- **Retention:** nightly prune of region items older than **90 days** (curated/global kept),
  matching the 30/60/90-day compaction norm for activity feeds — the feed is a pulse, not an
  archive (the Archive page is the archive).

## 7. Phases

- **P1 (one turn):** migration 0111 + the six trigger emitters + region read model + live pill +
  per-kind card designs (kind-colored kickers already exist in the page's design language).
- **P2:** rank_snapshots + `emit_ranking_moves` (the "nearby member climbed the rankings" cards),
  server-side aggregation if volume warrants, and the follows lane (0006 revival) as a separate
  personalized stream with its own fan-out decision.
