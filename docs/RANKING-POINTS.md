# Klimr Ranking Points — the complete scoring reference

*Version 1.2 · July 14, 2026 · Canonical spec + member training doc.*
*Every number in this document is computed from the formulas in `lib/ranking.ts` — the single place the constants live. Rows marked **LIVE** describe today's behavior; rows marked **PROPOSED** are upgrades awaiting sign-off.*

---

## 1 · Philosophy

Klimr's ranking is an **accumulation ladder**, not a chess rating: you climb by playing and by winning things that are hard to win. Five principles govern every number below:

1. **Real results only.** Points come from finished, recorded competition — never from RSVPs, attendance, classes, socials, or anything a player can farm without opponents.
2. **Harder wins are worth more.** A tournament title beats casual wins; a bigger draw beats a smaller one; and — the format principle — **the fewer teammates share the court, the larger each player's share of the result** (a 3s beach title outranks a 4s title of the same size).
3. **Recent form wins.** Only the **last 52 weeks** count, and only your **best 8 results** in that window sum to your number. Old glory ages out; one hot streak can't be stacked forever.
4. **Nothing is organizer-tunable.** Placement points are a pure function of field size and finishing place — no host can set a "tier" to inflate their event.
5. **One writer.** `player_sports.points` — the number the Rankings screen sorts by, per sport — is written in exactly one function (`recomputePlayerPoints`), fed by exactly two ledgers.

## 2 · The machinery (LIVE)

**Two ledgers.** `queue_points` records every open-play/queue match (one row per player per match, idempotent — double-taps can't double-award; guests earn nothing). `tournament_points` records tournament finishes (awarded by tournament staff, and **only after every match has a result**; a rostered reserve whose participation wasn't confirmed earns **50%**).

**One number.** For each sport, a player's points = the sum of their **best 8 results** across both ledgers from the last **52 weeks**. Because the pool is capped at 8, grinding casual games has a hard ceiling (8×12 = 96 pts) — tournament results are the only way past it, by design.

**Where you see it.** Rankings sorts your sport's ladder by this number; your regional standing (e.g. "top 12% of 90066 at tennis") is your position among players in that area — the points themselves are the same everywhere.

## 3 · Every way to earn points

| Source | Status | Points |
|---|---|---|
| **Open-play / queue match** (King-of-the-court sessions at events & courts) | **LIVE** | Win **12** · Loss **4** (participation share) — flat today; format factor **PROPOSED** below |
| **Tournament finish** (any Klimr tournament, all results in) | **LIVE** | Placement formula (§4) — champion of an N-entry draw earns **50 + 25×N**, each round below ≈ ×0.65, floor 5% |
| **Tournament reserve** (rostered, participation unconfirmed) | **LIVE** | 50% of the entry's placement points |
| **Organized `/play` match** (the Organize-a-match flow) | **GAP → PROPOSED** | Currently **0** — no result reporting exists. Proposed on ship: Win **15** · Loss **5** (× format factor), both-players-confirm required |
| Challenges (regional) | LIVE (display) | Challenges **sum** existing points by region — they never mint new points |
| RSVPs, attendance, classes, clinics, socials, hosting, reviews | **NEVER** | Zero, permanently — integrity rule #1 |

## 4 · Tournament placement formula (LIVE)

`championBase(N) = 50 + 25 × N` for an N-entry field. Finishing in place *p* earns `base × 0.65^ceil(log2 p)`, with a floor of 5% of base for anyone with a result. Placements derive automatically from the bracket (losers placed by the round they exit).

*(Raw formula, before the proposed format factor — the per-sport tables in §6 show the factored numbers.)*

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 150 | 98 | 63 | — | — |
| 8 entries | 250 | 162 | 106 | 69 | — |
| 16 entries | 450 | 292 | 190 | 124 | 80 |
| 32 entries | 850 | 552 | 359 | 233 | 152 |


**Reading it:** doubling the field roughly doubles the title's worth; each round survived is worth ~1.5× the round below.

**PROPOSED v1.1 — sub-linear champion base.** Linear `50+25×N` is fair at community draw sizes but distorts at scale: simulation shows a single 512-entry title would pay **12,850** points — ~3.5× the entire steady-state maximum of an active competitive population. One mega-event shouldn't outweigh a season. v1.1 proposes `championBase(N) = 60·√N + 40` (the shape behind proven tier systems like the ATP's): a 512-draw title becomes **1,398** — big, not ladder-breaking.

| Field | 8 | 16 | 32 | 64 | 128 | 256 | 512 |
|---|---|---|---|---|---|---|---|
| Linear (live) | 250 | 450 | 850 | 1,650 | 3,250 | 6,450 | 12,850 |
| √N (v1.1) | 210 | 280 | 379 | 520 | 719 | 1,000 | 1,398 |

Under v1.1 the founding example becomes: 8-team beach title → 210 raw → **147 in 3s vs 126 in 4s** (the ordering, of course, holds).

## 5 · The format factor (PROPOSED)

**The rule:** multiply any result's points by a factor based on players per side — smaller sides mean each player carried more of the result. Sub-linear on purpose: team formats stay worth playing.

| Players per side | 1 (singles) | 2 | 3 | 4 | 6 |
|---|---|---|---|---|---|
| **Factor** | 1.00 | 0.80 | 0.70 | 0.60 | 0.50 |

Applied to **both** ledgers (open-play and tournament placements). Rounding: half-up, minimum 1 point.

**The founding example, answered:** an 8-team beach volleyball draw pays its champion 250 raw points → **175 in 3s** vs **150 in 4s**. The 3s title is worth more. ✓

## 6 · Per-sport tables — every earning instance

### Tennis

| Action | Singles (×1.00) | Doubles (×0.80) |
|---|---|---|
| Open-play / queue **win** (live: flat 12) | 12 | 10 |
| Open-play / queue **loss** (live: flat 4) | 4 | 3 |
| Organized match **win** *(proposed — ships with result reporting)* | 15 | 12 |
| Organized match **loss** *(proposed)* | 5 | 4 |

**Tournament finishes — Tennis Singles** (placement × 1.00 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 150 | 98 | 63 | — | — |
| 8 entries | 250 | 162 | 106 | 69 | — |
| 16 entries | 450 | 292 | 190 | 124 | 80 |
| 32 entries | 850 | 552 | 359 | 233 | 152 |

**Tournament finishes — Tennis Doubles** (placement × 0.80 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 120 | 78 | 50 | — | — |
| 8 entries | 200 | 130 | 85 | 55 | — |
| 16 entries | 360 | 234 | 152 | 99 | 64 |
| 32 entries | 680 | 442 | 287 | 186 | 122 |

### Pickleball

| Action | Singles (×1.00) | Doubles (×0.80) |
|---|---|---|
| Open-play / queue **win** (live: flat 12) | 12 | 10 |
| Open-play / queue **loss** (live: flat 4) | 4 | 3 |
| Organized match **win** *(proposed — ships with result reporting)* | 15 | 12 |
| Organized match **loss** *(proposed)* | 5 | 4 |

**Tournament finishes — Pickleball Singles** (placement × 1.00 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 150 | 98 | 63 | — | — |
| 8 entries | 250 | 162 | 106 | 69 | — |
| 16 entries | 450 | 292 | 190 | 124 | 80 |
| 32 entries | 850 | 552 | 359 | 233 | 152 |

**Tournament finishes — Pickleball Doubles** (placement × 0.80 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 120 | 78 | 50 | — | — |
| 8 entries | 200 | 130 | 85 | 55 | — |
| 16 entries | 360 | 234 | 152 | 99 | 64 |
| 32 entries | 680 | 442 | 287 | 186 | 122 |

### Padel

| Action | Doubles (×0.80) |
|---|---|
| Open-play / queue **win** (live: flat 12) | 10 |
| Open-play / queue **loss** (live: flat 4) | 3 |
| Organized match **win** *(proposed — ships with result reporting)* | 12 |
| Organized match **loss** *(proposed)* | 4 |

**Tournament finishes — Padel Doubles** (placement × 0.80 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 120 | 78 | 50 | — | — |
| 8 entries | 200 | 130 | 85 | 55 | — |
| 16 entries | 360 | 234 | 152 | 99 | 64 |
| 32 entries | 680 | 442 | 287 | 186 | 122 |

### Racquetball

| Action | Singles (×1.00) | Doubles (×0.80) |
|---|---|---|
| Open-play / queue **win** (live: flat 12) | 12 | 10 |
| Open-play / queue **loss** (live: flat 4) | 4 | 3 |
| Organized match **win** *(proposed — ships with result reporting)* | 15 | 12 |
| Organized match **loss** *(proposed)* | 5 | 4 |

**Tournament finishes — Racquetball Singles** (placement × 1.00 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 150 | 98 | 63 | — | — |
| 8 entries | 250 | 162 | 106 | 69 | — |
| 16 entries | 450 | 292 | 190 | 124 | 80 |
| 32 entries | 850 | 552 | 359 | 233 | 152 |

**Tournament finishes — Racquetball Doubles** (placement × 0.80 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 120 | 78 | 50 | — | — |
| 8 entries | 200 | 130 | 85 | 55 | — |
| 16 entries | 360 | 234 | 152 | 99 | 64 |
| 32 entries | 680 | 442 | 287 | 186 | 122 |

### Beach Volleyball

| Action | 2s (×0.80) | 3s (×0.70) | 4s (×0.60) | 6s (×0.50) |
|---|---|---|---|---|
| Open-play / queue **win** (live: flat 12) | 10 | 8 | 7 | 6 |
| Open-play / queue **loss** (live: flat 4) | 3 | 3 | 2 | 2 |
| Organized match **win** *(proposed — ships with result reporting)* | 12 | 10 | 9 | 8 |
| Organized match **loss** *(proposed)* | 4 | 4 | 3 | 2 |

**Tournament finishes — Beach Volleyball 2s** (placement × 0.80 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 120 | 78 | 50 | — | — |
| 8 entries | 200 | 130 | 85 | 55 | — |
| 16 entries | 360 | 234 | 152 | 99 | 64 |
| 32 entries | 680 | 442 | 287 | 186 | 122 |

**Tournament finishes — Beach Volleyball 3s** (placement × 0.70 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 105 | 69 | 44 | — | — |
| 8 entries | 175 | 113 | 74 | 48 | — |
| 16 entries | 315 | 204 | 133 | 87 | 56 |
| 32 entries | 595 | 386 | 251 | 163 | 106 |

**Tournament finishes — Beach Volleyball 4s** (placement × 0.60 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 90 | 59 | 38 | — | — |
| 8 entries | 150 | 97 | 64 | 41 | — |
| 16 entries | 270 | 175 | 114 | 74 | 48 |
| 32 entries | 510 | 331 | 215 | 140 | 91 |

**Tournament finishes — Beach Volleyball 6s** (placement × 0.50 format factor):

| Field size | Champion | Finalist | Semifinalist (3rd–4th) | Quarterfinalist (5th–8th) | Round of 16 (9th–16th) |
|---|---|---|---|---|---|
| 4 entries | 75 | 49 | 32 | — | — |
| 8 entries | 125 | 81 | 53 | 34 | — |
| 16 entries | 225 | 146 | 95 | 62 | 40 |
| 32 entries | 425 | 276 | 180 | 116 | 76 |



## 7 · Integrity rules

**LIVE:** one row per (match, player) — replays can't double-award · guests never earn · tournament awards are staff-gated and blocked until all results are in · reserves earn 50% · the 52-week / best-8 pool is the decay mechanism (no separate decay needed).

**PROPOSED (optional, low urgency — best-8 already caps farming):** repeat-opponent damping (2nd+ result vs the same opponent within 7 days earns 50%, max 3 counted per pair per week) · organized-match results require both players' confirmation · forfeits award the winner half a win and the forfeiter zero.

**Deliberately absent:** opponent-strength (Elo-style) adjustments — an accumulation ladder rewards showing up and winning things; strength-of-field is already priced in via draw size. Revisit only if regional ladders mature into competitive circuits.

## 8 · Worked examples

- *Maya wins 5, loses 2 at a Tuesday pickleball doubles queue night:* live = 5×12+2×4 = **68** · proposed (×0.80) = 5×10+2×3 = **56** — but only her best results land in the best-8 pool.
- *Cole is runner-up in a 16-entry tennis singles tournament:* 292 points (×1.00) — one result that outweighs a week of queue wins, as intended.
- *Priya's 6s beach team takes a 32-entry title:* raw 850 → **425** each at ×0.50 — a big result, priced for a six-way share.

## 9 · Tuning & change control

All constants live in `lib/ranking.ts` (window, best-N, pickup values, champion base, round factor, floor, reserve share). The format factor plugs in as `pickupMatchPoints(won, teamSize)` and a multiplier on `placementPoints` — team size comes from queue team membership counts and the tournament's format config. Any change to this schedule bumps the version header here and lands in `docs/DESIGN_DECISIONS.md`; recomputation is retroactive-safe because `recomputePlayerPoints` re-derives from the ledgers.

## 10 · Proof, scale & longevity

**Simulated, not guessed.** A 2,000-player Monte Carlo (60% casual, 30% regular with monthly 16-draws, 10% weekly competitors; three full years) validates the design:

| | p50 | p90 | p99 | max | top-vs-median |
|---|---|---|---|---|---|
| Year 1 (live formulas) | 96 | 1,587 | 2,664 | 3,716 | 38.7× |
| Year 2 | 96 | 1,587 | 2,509 | 3,821 | 39.8× |
| Year 3 | 96 | 1,587 | 2,637 | 3,705 | 38.6× |

**Steady state is structural.** Every percentile is flat from year 1 to year 3: the 52-week window + best-8 pool means the system reaches equilibrium within one year and **never inflates** — "years of accumulation" is a non-problem by construction (the same rolling best-N mechanism the ATP has run for decades). The median sits exactly at the casual ceiling (8×12 = 96), and tournament play is the only path above it, as designed. With the √N champion base, the top-vs-median ratio compresses from ~39× to ~24× — a more legible ladder — and mega-draw distortion disappears (table in §4).

**Data at millions of users.** The ledgers are the only unbounded growth (~100-byte rows; 1M active players ≈ 200M rows/year). The plan: (a) composite indexes `(user_id, sport_key, earned_at)` on both ledgers — shipped in 0119 — keep every recompute read bounded regardless of table size; (b) recompute cost is O(1) per player per result (top-8 from each ledger), never a scan; (c) the nightly snapshot job reads `player_sports` (already-computed numbers, one indexed pass over ranked players) — 0119 replaced its former full-ledger aggregate, which also fixed a correctness bug (it had ranked a lifetime queue-only sum, so feed "climbed" cards disagreed with the real ladder); (d) when a ledger crosses ~50M rows, partition by month on `earned_at` — reads stay identical, maintenance drops to per-partition; rows older than the window are audit/history (they feed head-to-head displays), so archive-don't-delete.

**Regional percentiles at scale.** "Top 12% of 90066" is a count-above-threshold within a ZIP cohort — served by `player_sports (sport_key, points)` plus the profiles ZIP join; at large cohorts, precompute per-ZIP percentile bands in the nightly snapshot job rather than counting per page view.

## 11 · Inactive players (APPROVED v1.2 — 180-day gate)

**What already happens (LIVE).** The 52-week window is the ATP's own inactivity mechanism: stop playing and your results age out one by one, so your number *steps down* over the months your last active year spanned — a natural, gradual decay, not a cliff — reaching zero within 52 weeks of your last result. Permanent leavers therefore remove themselves from the ladder automatically; nothing special is required, ever.

**How the proven systems handle it:** FIDE keeps the rating but flags inactive players and removes them from the published list (Kasparov still holds 2812, invisible on the rankings) — and is moving toward gradual decay precisely because indefinitely retained numbers distort rankings. The ATP needs no flag at all: rolling 52-week expiry zeroes the inactive. The composite lesson: **keep the earned number, gate the published list on activity, let the window do the decay.**

**Klimr's policy (approved):**
- **Ladder visibility gate — 180 days:** the Rankings list shows players with ≥1 recorded result in the last 180 days. Points are untouched underneath — one new result and you reappear at full standing instantly.
- **Cohort honesty:** regional percentiles and challenge standings compute over the *active* set only.
- **Transparency:** ranking rows show "last played"; profiles carry the permanent **ranking history graph** — a player's peak is never lost, even years after they stop.
- **Deliberately not doing:** extra decay curves (the window already decays in steps), and protected rankings for injury/leave (revisit if competitive circuits mature).
