# Google Places — Stored-Fields Inventory (for legal review)

**Status:** Engineering inventory complete · **Awaiting counsel** · August 2026 · K3-07 (audit COURT-003)

Prepared so a lawyer can answer a compliance question without reading the
codebase. This document states **exactly what Klimr requests from the Google
Places API, exactly what it writes to its own database, and for how long.** It
deliberately does not offer a legal conclusion — engineering's job here is an
accurate inventory and a precise list of questions.

---

## 1. What we request

Two endpoints, both Places API (New), with an identical field mask:

- `POST https://places.googleapis.com/v1/places:searchNearby`
- `POST https://places.googleapis.com/v1/places:searchText`

**Field mask (verbatim from `app/courts/search-actions.ts`):**

```
places.id, places.displayName, places.formattedAddress, places.location,
places.rating, places.userRatingCount, places.businessStatus,
places.types, places.primaryType, places.websiteUri
```

We do **not** request: photos, reviews, review text, opening hours, phone
numbers, price level, editorial summaries, or any Contact Data field.

---

## 2. What we store, where, and for how long

### 2a. `court_search_cache` — the raw result cache
| Column | Contents | Source |
|---|---|---|
| `zip`, `radius_km`, `sport` | our own query key | Klimr |
| `results` | **JSON blob of the Places response**, field-masked as above | Google |
| `fetched_at` | timestamp | Klimr |

**Retention:** `COURTS_CACHE_TTL_DAYS`, default **7 days**; empty results 30
minutes. Rows are overwritten on the next live search for that key.
**This is the object most likely to be in scope for a caching restriction**,
because it holds Google-returned content verbatim.

### 2b. `court_sport_intel` — per-venue verification verdicts
| Column | Contents | Source |
|---|---|---|
| `place_id` | Google Place ID | Google |
| `display_name`, `address`, `lat`, `lng`, `website` | denormalised from the Places result | Google |
| `rating`, `rating_count` | Places rating + count | **Google** |
| `verdict`, `confidence`, `reliability`, `evidence`, `evidence_excerpt`, `source_url` | Klimr's own AI verification of whether the venue supports a sport | **Klimr-generated** |
| `checked_at`, `verifying_at` | timestamps | Klimr |

**Retention:** indefinite, refreshed when a verdict goes stale (7-day freshness
window). **No automatic expiry today** — this is a deliberate flag for counsel.

### 2c. `courts` — the curated Klimr court directory
| Column | Contents | Source |
|---|---|---|
| `google_place_id` | Google Place ID | Google |
| `name`, `address`, `lat`, `lng`, `website`, `city`, `state`, `zip`, `neighborhood` | seeded from Places, then human/AI corrected | Mixed |
| `rating`, `rating_count` | Places rating + count | **Google** |
| `sports`, `amenities`, `indoor`, `lights`, `free`, `court_count`, `is_private`, `facts_inference`, `facts_inferred_at`, `confirmed_at`, `confirmed_by` | Klimr's own data | Klimr |

**Retention:** indefinite — this is Klimr's directory of record.

### 2d. `court_evidence` (migration 0181)
Stores `source_url` and quoted `excerpt` from **the venue's own website**,
fetched directly by Klimr — not Places content.

---

## 3. What we display, and how attribution works today

- Court results render inside Klimr's own UI, not on a Google map.
- Public court pages embed a **keyless Google Maps iframe** for the venue
  location, and "open in Maps" links use a name+address query with
  `query_place_id`.
- Ratings are shown with their count where present.
- **We do not currently render a "Powered by Google" attribution** on
  Klimr-rendered result lists. Flagged for counsel — see Q4.

---

## 4. Questions for counsel

1. **Caching window.** Google's Places terms restrict caching of most Place
   content, with Place IDs treated differently. Does our 7-day
   `court_search_cache` sit inside the permitted window, and does the
   **indefinite** retention of denormalised fields in `court_sport_intel` and
   `courts` (name, address, lat/lng, website, rating) exceed it?
2. **Ratings specifically.** `rating` and `userRatingCount` are stored
   indefinitely in two tables. Are aggregate ratings subject to a stricter rule
   than other fields, and must they be refreshed or dropped on a schedule?
3. **Place ID as the durable key.** If most content must expire, is the
   compliant pattern to retain only `place_id` plus Klimr-generated data
   (`verdict`, `sports`, `amenities`) and re-fetch display fields on demand?
   Engineering can implement that — it is a scoped change, not a rewrite.
4. **Attribution.** Where Klimr renders Places-derived name/address/rating in
   its own UI, is a visible Google attribution required, and in what form?
5. **Derived data.** Our AI verdict is Klimr-generated but is *derived from* a
   Places result plus the venue's own website. Does the derived verdict carry
   any restriction, or is it ours outright?
6. **User-supplied venues.** Courts added by members without a `google_place_id`
   carry no Places data. Confirming that puts them entirely out of scope.

---

## 5. Engineering notes for whichever way this lands

- **Expiry is cheap to add.** The pieces already exist: `checked_at` /
  `fetched_at` timestamps on every table, and a durable jobs system (0178) that
  can run a scheduled purge or refresh. A "retain Place ID + Klimr data, expire
  Google display fields after N days" policy is a small migration plus one job
  handler.
- **The intel table is designed to survive it.** `verdict`, `confidence`,
  `evidence`, and `source_url` are Klimr's own and come from the venue's website,
  not Places, so a purge of Google-derived columns would not destroy the
  verification work.
- **Attribution is a UI change**, not a data change — a line in the results
  header and on court cards.
- Nothing here blocks the pilot; it should be resolved before any public
  marketing of the courts directory as a Klimr asset.
