---
paths:
  - "supabase/**"
  - "app/api/**"
  - "lib/**"
  - "**/*.sql"
  - ".github/**"
---

# Silent failure, canaries, and work that stops happening

**ADAPTATION 2 to the source package.** The installed rules are strong on proving code correct and thin on detecting work that quietly stops. Every one of the ten worst defects found during the August 2026 remediation was of this second kind: nothing threw, nothing logged, no test failed, and no monitor fired — because there was no exception to catch.

You cannot alert on an exception that is never raised. You *can* alert on work that should have happened and did not.

## The failure shape

All of these looked healthy:

| What happened | Why nothing fired |
|---|---|
| Both cron routes had never executed for their entire lives | Middleware redirected them to an HTML login page; Vercel's scheduler follows redirects and recorded 200 |
| Nobody was ever notified of a connection request | A `CHECK` constraint rejected five notification kinds; supabase-js returns `{ error }` rather than throwing, and the caller discarded it |
| Court sessions never expired | No expiry existed anywhere in the schema; the Live Fleet counted five-day-old queues as running venues |
| The Feed scope selector did nothing | The control wrote `?scope=`; the page read `?lane=` |
| Every share link went nowhere useful | The card copied `/feed?post=<id>`; the page never read `post` |
| The zero-result search metric misreported | It divided zeros by hits; the error grew with the quantity measured, so the dashboard was calmest when search was most broken |

## Rules

- **Ask what proves the work happened**, not that it was invoked. A fired request, a scheduled entry, and a returned 200 are all evidence of invocation only. `net.http_post` does not inspect its response.
- **Check every returned result.** A discarded `{ error }`, a silent zero-row update, or a partial insert is a failure. supabase-js does not throw on constraint violations; `catch {}` around it catches nothing.
- **Add a canary that measures absence.** For any scheduled job, delivery path, or reconciliation, extend `klimr_health()` with a question whose answer only changes when something has stopped: events undelivered past their window, sessions past their cap, offers expired but unswept, moderation or reports past their SLA.
- **Never assert a threshold you cannot derive.** A canary asserting a number nobody can justify warns on a healthy system, gets muted within a week, and takes the true alarm with it. Report the count; assert only what follows from the design.
- **Prefer measuring the effect over the cause.** "Is the job scheduled" is a guess about mechanism. "Are there sessions past the 12-hour cap" is evidence about outcome, and cannot be wrong about a threshold.
- **Prefer in-database scheduling for pure-SQL work.** An HTTP cron route depends on DNS, TLS, routing, middleware classification, and a secret matching across two systems, and reports none of those failures. A pg_cron job calling a SQL function has none of that surface. Reserve HTTP for work that genuinely needs the application layer, and let a canary cover the remainder.
- **A guard that is always false is indistinguishable from a missing feature.** Test that the guard evaluates true in the environment you expect it to. `to_regproc` takes a name; `to_regprocedure` takes a signature — the wrong one silently returns null forever.

## Required evidence

- A canary added for the affected subsystem, or a written reason why the existing canaries already cover it.
- Proof the canary detects the failure: create the bad state, watch it report, restore.
- For scheduled work: what is checked, on what interval, and who sees it when it fires.

## supabase-js never throws (KFU-035, 2026-08-20)
- Every `.insert/.update/.delete/.upsert` destructures and checks `{ error }`.
  Audit-trail writers fail LOUD (`AUDIT WRITE FAILED` + identifying fields),
  never silently, and never take the audited operation down.
- Deferred-write fallbacks are RETURNED promises the caller awaits — a
  `void work()` fallback is fire-and-forget in exactly the contexts that kill
  unawaited writes (the durably() lesson).
