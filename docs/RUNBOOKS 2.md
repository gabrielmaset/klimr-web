# Klimr Incident Runbooks

**Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K2-03 (audit DEP-005)

Short, do-this-now procedures for the three failures most likely to happen
during the pilot. Each is written to be followed at a venue, on a phone, under
time pressure. Keep this file findable — `docs/RUNBOOKS.md` in the repo, and
know the two admin URLs by heart: **`/admin/jobs`** and **`/admin/diagnostics`**.

Standing rule: **restore play first, diagnose second.** A venue full of waiting
players is the emergency; the root cause can wait twenty minutes.

---

## Runbook 1 — The queue is stuck at a venue

*Symptoms: the courtside display isn't advancing, players report their join
didn't register, or a court shows a team that already finished.*

**1. Is it the display or the data?**
Open the same session on your phone (`/queue/<id>`). If your phone shows the
correct state and the display doesn't, it's the **display device** — skip to
step 4. If both are wrong, it's **data** — continue.

**2. Force a fresh snapshot.**
The poll returns `304 Not Modified` when the session version hasn't changed
(K2-02). A stuck version means writes aren't landing. Make any small organizer
edit (rename a court, toggle pause off/on) — that bumps the version and forces
every client to re-render. If the edit itself fails, the database write path is
the problem: go to step 3.

**3. Check for a failed write path.**
Open `/admin/diagnostics` and look for recent errors mentioning `queue`,
`place_on_team`, or `court_sessions`. Two known shapes:
- *"function place_on_team does not exist"* → migration **0176** has not been
  applied to production. Apply it (see `MIGRATIONS_LEDGER.md`); joins will work
  immediately after.
- *Lock timeout / statement timeout on queue tables* → a long transaction is
  holding a court. It clears on its own; if it doesn't within ~2 minutes,
  pause and un-pause the session, which forces a clean re-read.

**4. Reset the display device.**
Pull to refresh, then hard-reload the tab. If the iPad shows a stale code, the
session was reset — pull the current join code from the organizer console and
re-enter it. Last resort: end the session and start a new one; players rejoin
by QR in under a minute and no rankings data is lost (completed matches are
already recorded).

**5. Manual fallback (never skip this).** Run the stack on paper. Klimr going
down must never end open play. Log the results afterward from the organizer
console.

---

## Runbook 2 — A cron tick was missed

*Symptoms: waitlist offers never expired, tournaments not finalized, ranking
points not awarded overnight.*

**1. Identify which cron.**
- `waitlist-sweep` — every minute via pg_cron (migration 0172/0173). Expires
  overdue offers, cascades spots, **and drains the jobs queue** (K2-03).
- `finalize-tournaments` — daily 06:00 UTC via Vercel cron. Finalizes and
  awards ranking points.

**2. Confirm it's actually missed, not unauthorized.**
Both routes **fail closed** (K0-03): if `CRON_SECRET` or `WAITLIST_CRON_SECRET`
is missing or wrong, they return **401** and do nothing. Check the Vercel
function logs for 401s. A wave of 401s means a secret was rotated or dropped —
restore it in Vercel env and the next tick self-heals.

**3. Catch up manually.**
Both routes are **idempotent** — re-running them is safe and is the intended
recovery. Trigger the route once with the correct secret. Waitlist state
converges immediately; tournament finalization picks up everything still
pending.

**4. Nothing is lost in the gap.** Offer expiry is computed from stored
timestamps, not from the tick, so a late sweep expires exactly the offers that
should have expired. Players see the cascade land late, not incorrectly.

**5. If ticks keep missing.** pg_cron jobs live in the database — check the
Supabase dashboard's cron section. A paused project stops crons entirely;
Supabase Pro (active since Aug 2026) prevents auto-pausing, so a repeat here
points at the pg_net extension or a bad URL/secret rather than pausing.

---

## Runbook 3 — Court verification backlog

*Symptoms: `/admin/jobs` shows dead-lettered `verify_venue` jobs, courts show
"Listed · Unverified" more than usual, or the monthly live-search cap is
burning fast.*

**1. Open `/admin/jobs`.** The dead-lettered table shows each failed job with
its last error and attempt count. Read the error before acting — it names the
cause.

**2. Match the error to the cause.**
- *401 / invalid key* → `ANTHROPIC_API_KEY` or `GOOGLE_MAPS_API_KEY` is missing
  or expired. Fix in Vercel env. Courts keep serving **intel-only** results
  meanwhile (K1-05), so the feature degrades rather than breaks.
- *429 / rate limited* → the vendor is throttling. Do nothing; backoff already
  spaces retries (10 s, 20 s, 40 s… capped at 1 h). Replay only after the
  window passes.
- *Timeout / fetch failed* → the venue's own website is down. This is normal
  and self-corrects; the venue simply stays unverified for now.

**3. Replay after fixing.** Use the **Replay** button on each dead job — it
re-queues with a fresh attempt budget. Handlers are idempotent, so replaying a
job that partly succeeded is safe. Replays are cheap: a venue verified within
the last 7 days short-circuits without spending AI budget.

**4. Watch the cap.** `COURTS_MONTHLY_LIVE_SEARCH_CAP` (default 800) bounds
live searches per month. If it's nearly spent mid-month, raise it deliberately
in Vercel env or let cached areas serve — capped searches still return cached
and intel-only results, never an empty map.

**5. Escalate only if dead jobs keep reappearing** after a successful replay.
That means the handler itself is failing, not the dependency — capture one job
id and its error, and treat it as a code bug rather than an ops incident.

---

## After any incident

1. Note what happened, when, and what fixed it — one paragraph is enough.
2. If it was a code or schema fault, it earns an entry in
   `docs/DESIGN_DECISIONS.md`.
3. If it could recur, add or amend a runbook here. This file is only useful if
   it grows from real incidents.
