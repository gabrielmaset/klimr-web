# Klimr — standing decisions register

**Read this before proposing anything that contradicts it.**

A new session has no memory. Chat history contains proposals, rejected drafts, and
decisions side by side, and they look alike in a search result. This file is the short
answer: what is settled, by whom, and what it supersedes.

**A decision belongs here only when the owner stated it.** Claude's suggestion — however
well received — is not a decision until Gabriel says so. `docs/DESIGN_DECISIONS.md` holds
the engineering reasoning; this holds the conclusions that must not be silently re-litigated.

If you believe a decision here is wrong, say so explicitly, give the reason, and ask.
Changing a settled decision quietly is worse than the original mistake.

---

## Company and fundraising

| # | Decision | Detail | Supersedes |
|---|---|---|---|
| D-01 | **The raise is $900,000** | Not an increase in ambition — the old $710,270 base was wrong. Six orphaned rows (~$184,760) had fallen out of Use of Funds, a co-founder salary was misclassified, and thin lines were raised for monitoring, messaging and event liability insurance. Rebuilt base $762,500 + 18% contingency $137,250 = $879,750, ceilinged to $900,000. Signed off Aug 5 2026 as a D11 amendment. | **$825,000.** Any document still showing $825K is stale |
| D-02 | **Klimr does not process payments in v1** | The tournament payments surface is record-keeping only. Organizers use Venmo/Zelle and keep their own records. Klimr is *not* the system of record, so payment-proof screenshots get 400-day retention, not indefinite | — |
| D-03 | **The rejected markdown set is not a source** | An August reconstruction with `*_2026-08.md` filenames and an $825K ask was rejected as watered-down. The accepted August work is the surgical `.docx` refresh under original filenames | — |
| D-04 | **Investor documents stay Word/Excel; repo docs stay Markdown** | The nine investor documents are `.docx`/`.xlsx` and are edited surgically in their own styles — never rebuilt from summaries. Repo control documents are Markdown because four of them are asserted by `tests/doc-claims.test.ts` and a `.docx` cannot be diffed or tested | — |

## Product policy

| # | Decision | Detail |
|---|---|---|
| D-10 | **18+ at launch** | Age attestation, enforcement, no marketing to minors. A youth program comes later, alongside coach background checks |
| D-11 | **Five sports** | Tennis, pickleball, padel, racquetball, beach volleyball. Golf was removed July 2026 |
| D-12 | **Privacy is one ladder, not fifteen toggles** | `everyone ⊃ network ⊃ following ⊃ connections`, five settings. Defaults: requests/invites/comments `everyone`, messages `network`, tagging `following`. Full matrix in `docs/RELATIONSHIP-PRIVACY-POLICY.md` |
| D-13 | **Per-member control is three named lists** | Mute, restrict, block — not per-person settings for every capability. All three are silent; the other person is never told |
| D-14 | **Blocked users' past comments hide, not delete** | Reversible on unblock. Deleting would be irreversible and would tear holes in other people's threads |
| D-15 | **Connections list and upcoming matches are connections-only** | Not member-configurable. A visible connections list maps who plays with whom after a block; upcoming matches is a member's location at a known future time |
| D-16 | **Legal name is never public** | `display_name` plus optional public `nickname`. `first_name`/`last_name` are verification data and stay out of `profiles_public` |
| D-17 | **No reposts** | Machinery exists in the schema but the action refuses. The ranking excludes reposts and the card tells members they do not exist |

## Operations and safety

| # | Decision | Detail |
|---|---|---|
| D-20 | **Video stays disabled at the boundary** | A trigger rejects video posts; the bucket admits images only. Re-enabling requires the full screening gate first — containment was chosen over a partial gate |
| D-21 | **Court sessions expire at a hard 12-hour cap** | Ends the session even with teams queued, a live match, or a connected display. A queue that outlives its play is worse than an empty one |
| D-22 | **Confirmed CSAM is never copied off-provider** | False positives and pending reviews are backed up encrypted. Confirmed matches are preserved in place under legal hold. Changing this is a conversation with a lawyer, not a script edit |
| D-23 | **Backups go to two providers** | Cloudflare R2 primary (no egress fees, and a restore reads everything back), Backblaze B2 second. Sensitive buckets are client-side encrypted |
| D-24 | **pg_cron over HTTP cron for pure-SQL work** | An HTTP route depends on DNS, TLS, routing, middleware and a secret matching across two systems, and reports none of those failures. Both Vercel cron routes had never run for their entire lives |
| D-25 | **Public GO is blocked on a tested Storage restore** | Recorded as B-01/B-02 in the control register. A database restore today returns every row pointing at bytes that no longer exist |

## Working agreement

| # | Decision | Detail |
|---|---|---|
| D-30 | **Never rebuild the zip unless the owner says "rebuild"** | — |
| D-31 | **Migrations are `cat` verbatim from the repo file** | Never retyped. Header format `-- 0NNN_name.sql — adds ...`. Pasted into the Supabase SQL editor in numeric order |
| D-32 | **Ask before producing a missing source** | If a file, version or figure is missing, say so and stop. Do not reconstruct a deliverable from chat history and present it as an update |
| D-33 | **Every batch ends with an iPhone impact line** | "iPhone impact: none" or a description |
| D-34 | **`DESIGN_DECISIONS.md` gets a dated entry per batch** | Including the mistakes — those are the entries most worth keeping |
| D-35 | **Lint ratchet may fall, never rise** | Currently `--max-warnings 137`, asserted by test |

---

## How to add to this file

A row is added when the owner states a decision, not when Claude proposes one. Record the
decision, the reason in one line, and what it supersedes. Date it in
`docs/DESIGN_DECISIONS.md`, where the reasoning lives.
