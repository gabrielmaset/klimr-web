# Search Relevance — Decision Framework

**Status:** Instrumented, awaiting data · August 2026 · K3-08 (audit SRCH-004)

The audit recommended investing in Postgres full-text search / trigram matching
plus a reranker. The independent assessment **disagreed** and deferred the call
until there was field evidence. This document is that call, written **before**
the data arrives so the thresholds cannot be rationalised afterwards.

---

## The disagreement, restated fairly

**The audit's case:** the deterministic layer is prefix/substring matching over
a handful of columns. It will miss typos, word-order variation, and partial
names. FTS with trigram fallback is a well-understood fix.

**The assessment's case:** Klimr's search is mostly **navigational, not
exploratory** — people look for a named person, a named venue, a named
tournament. Prefix matching serves that well. Ranking investment pays off when
users browse an ambiguous result set, which is not obviously the behaviour here.
Building FTS + a reranker before knowing the failure rate risks solving a
problem the product does not have.

Both are reasonable. Neither is checkable without numbers.

---

## What is now measured (migration 0188)

| Metric | Meaning |
|---|---|
| `search_deterministic` | latency of a search that returned results |
| `search_zero` | a search that returned **nothing** |
| `search_ai` | latency when the AI concierge path is used |

`search_zero_rate(hours)` returns searches, zero-results, and the percentage.
Sampled at 10%, and the **query text is deliberately not stored** — a search log
is a behaviour log, and `perf_samples` is a latency histogram.

The K1-04 golden corpus already covers correctness of the deterministic layer
(kind routing, stopwords, condensation) in CI, so this fills the missing half:
what happens with real queries from real people.

---

## The decision rule — committed in advance

Review after **≥ 2 weeks of pilot traffic** with **≥ 500 sampled searches**.

**Invest in FTS + trigram if any of these hold:**
- **Zero-result rate > 15%.** More than one search in seven finding nothing
  means the matcher is failing real intent, not just filtering.
- **p95 `search_deterministic` > 400 ms.** If it is both imprecise and slow,
  the rewrite pays for itself twice.
- Qualitative: a venue organizer reports players "can't find" something that
  demonstrably exists.

**Do NOT invest — close the item — if:**
- Zero-result rate **< 8%** and p95 latency is within budget. At that rate the
  matcher is doing its job and a reranker would be polish on a solved problem.

**Between 8% and 15%:** do the cheap thing first — add a trigram index on the
existing name columns (a migration, not an architecture) and re-measure. Only
consider a reranker if the zero-rate stays above 12% afterwards.

---

## Why a threshold decided in advance

The failure mode with "we should improve search" is that it is always
defensible, so it wins arguments regardless of evidence. Writing the trigger
numbers down before the data exists means the data can actually settle it —
including settling it as **no**, which is the outcome the assessment considers
most likely and which would save weeks of work.

**Reassess the thresholds only if the product's search behaviour changes shape**
— for example if browse/discovery becomes a primary path rather than
navigation. Moving the threshold because the current number is inconvenient is
the thing this document exists to prevent.

---

## If the answer is "invest"

Order of work, cheapest first:
1. `pg_trgm` index on `profiles.display_name`, `courts.name`, `tournaments.title`,
   `events.title`; switch the matcher to similarity with a tuned floor.
2. Re-measure. Most zero-result cases are typos and word-order, which trigram
   alone fixes.
3. Only then consider FTS with weighted `tsvector` columns.
4. A reranker last, and only with evidence that ordering — not matching — is the
   complaint.
