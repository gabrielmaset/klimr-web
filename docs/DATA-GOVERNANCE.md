# Klimr Data Governance — Identity, Deletion & Retention

The operating rules for user identification, account deletion, and what Klimr
retains afterward. US-only service (the ZIP gate); the governing framework is
California's CCPA/CPRA. Update this document whenever the pipeline changes.

## 1. Identifiers
- **Canonical ID: the account UUID** (`auth.users.id` = `profiles.id`).
  Immutable, unique, never reused — assigned at signup, referenced by every
  table, log, and audit record. This is Klimr's "social-security-style" ID.
- **Member number (`profiles.member_no`)**: a short, human-readable, immutable
  companion (e.g. #10023) for support conversations and admin screens. Assigned
  from a monotonically increasing sequence; never reused.
- Display names are labels, never identifiers. Admin surfaces always show
  name + member number (+ UUID where useful).

## 2. Account lifecycle
1. **Active.**
2. **Archived (deactivated)** — admin action or user request; sign-in blocked;
   fully recoverable. This is the grace window.
3. **Purged** — after 30 days archived (nightly `purge_archived_accounts()`),
   or immediately by a superadmin. Auth user and cascading personal rows are
   deleted; the avatar file is removed.
4. **Ledgered** — at purge time, one row is written to
   `deleted_users_ledger`: UUID, member number, display name, email, account
   dates, when/by whom/why purged. **Service-role access only** (RLS enabled,
   zero client grants). This is the only mapping from a purged UUID back to an
   identity.

Industry benchmark: a ~30-day cancelable window then up to ~90 days to clear
active systems is the norm (Meta, TikTok, X); platforms retain logs
disassociated from identifiers for security and legal reasons. Klimr's
30-day grace + immediate structured purge + restricted ledger is tighter than
that norm while keeping the lawful records.

## 3. What survives deletion, and why it's lawful
| Record | Contents after purge | Legal basis |
| --- | --- | --- |
| `deleted_users_ledger` | Identity snapshot (UUID, member #, name, email, dates) | CCPA §1798.105(d): security/fraud detection & prosecution; legal obligation. §7022: record that deletion occurred / stays deleted |
| `error_logs` | Pseudonymous UUID + technical detail (FK dropped; profile gone) | §1798.105(d)(2): debug/repair existing functionality; security |
| `admin_actions` | Audit trail (target nulled on cascade; details retain context) | Security, fraud, legal defense |
| Support tickets / emails | Ticket history keyed by member ref | Transactional records; legal obligation |
| E2E message ciphertext | Undecryptable without participants' device keys | Content was never readable by Klimr |

Everything else — profile, photos, listings, connections, RSVPs — cascades away
at purge.

## 4. Deletion-request handling (CCPA/CPRA)
- Acknowledge within 10 business days; complete within 45 days (one 45-day
  extension allowed with notice).
- Verify identity before deleting.
- Response must state what was retained and under which exemption (the table
  above is the script).
- Keep records of requests ≥ 24 months (the ledger `reason` +
  support ticket satisfy this).
- Backups: deletion applies to active systems; backup copies age out on the
  provider's cycle (Supabase PITR/backup retention) — permitted treatment.

## 5. Retention targets
| Data | Target | Enforcement |
| --- | --- | --- |
| Error logs | 12 months | future pg_cron trim (add when volume warrants) |
| Notifications | 12 months | future pg_cron trim |
| Deletion ledger | Indefinite (fraud/legal) | reviewed annually |
| Admin audit log | Indefinite | reviewed annually |
| Marketplace threads | Listing life + 30 days (expiry), content E2E | in place |

## 6. Commitments
- The ledger is never used for marketing, analytics, or product features —
  security, fraud, legal, and support identity resolution only.
- New tables that reference users must decide **cascade vs. pseudonymize** at
  design time (Feature Integration Checklist §7) — logs/audit pseudonymize,
  personal content cascades.
- Any future EU availability triggers a GDPR review before launch (erasure
  grounds are narrower than CCPA's exemptions).

---

## 7. Object-level data map (K1-08 · audit PRIV-001/PRIV-003)

Classification per object: **P** = personal (identifies a member), **Op** =
operational, **Sec** = security/audit. "Reader" is who may read at runtime.

### Tables — personal
| Object | Class | Purpose | Reader (runtime) | Retention |
|---|---|---|---|---|
| `profiles` | P | Account, display identity, home ZIP | Owner + RLS-scoped viewers; service role | Life of account; purged on deletion |
| `auth.users` | P | Auth identity, email | Supabase Auth; service role | Life of account; deleted on purge |
| `mfa_failed_verification_attempts` | Sec | TOTP lockout counters (0055) | `supabase_auth_admin` + privileged server (K1-02) | Rows self-expire; cleared on success |
| `connections` / social graph (0099) | P | Follows, requests, blocks | RLS-scoped to the two parties | Life of account |
| `event_registrations`, `tournament_registrations` | P | Who signed up | Organizer + registrant (RLS) | Life of event + history value |
| `queue_teams`, `queue_join_requests` | P | Live-play participation, guest names | Session organizer + participant (RLS) | Cleared on session reset/off |
| `posts`, `comments`, `post_tags` | P | Social feed content | Audience-scoped (RLS) | Life of account or until deleted |
| `deleted_users_ledger` | P | Purged-UUID → identity mapping | **Service role only** (RLS, zero grants) | Retained (legal/audit); the only post-purge identity map |

### Tables — operational / security
| Object | Class | Purpose | Reader | Retention |
|---|---|---|---|---|
| `rank_snapshots` | Op | Nightly ranking history for feed moves | **Definer function only** (0174: RLS on, grants revoked) | Rolling |
| `court_search_cache` | Op | Cached court lists per ZIP+radius+sport | Service role | TTL (default 7d); empty rows 30 min |
| `court_sport_intel` | Op | Source-checked venue verdicts + evidence (0175) | Service role; read-overlaid into results | Freshness-scored; re-verified on staleness |
| `admin_actions` | Sec | Append-only staff + privileged-client audit (K1-01) | Admins (RLS); service role | Retained |
| `error_logs` | Sec | Server + Courtside diagnostics | Admins (RLS) | Rolling; daily cap (K1-03) |
| `service_usage` | Op | Monthly live-search spend counter | Service role | Rolling monthly |

### Storage buckets
| Bucket | Class | Contents | Reader | Retention |
|---|---|---|---|---|
| Avatars | P | Profile images | Public-read by design; owner writes | Removed on purge |
| Post media | P | Feed images | Audience-scoped via signed access | With the post |

### External processors (sub-processors)
| Vendor | Data shared | Purpose | Notes |
|---|---|---|---|
| Supabase | All DB + auth + storage | Primary datastore | Pro tier; daily backups; US region |
| Vercel | Request metadata, logs | Hosting/runtime | Commercial tier at launch |
| Resend | Email address, message body | Transactional email | `notifications.klimr.com` |
| Anthropic | Query text; venue names/URLs | AI search + courts verifier | See §8; zero-retention path, no training |
| Google (Maps/Places) | ZIP/coords, venue queries | Court discovery | Coordinates coarsened per §9 |
| Cloudflare Turnstile | Challenge token, IP | Bot defense | Fails open by documented design |

## 8. AI vendor data flow (K1-08 · audit SRCH-003)
- **What leaves Klimr.** AI global search sends only the user's **query text**
  plus the server-minted result **bank** (titles + internal hrefs the user could
  already see). The courts verifier sends **venue names and website URLs** to be
  checked. No emails, no precise personal coordinates, no internal IDs beyond
  what public pages already expose.
- **Retrieval is RLS-bound.** In AI search the model orchestrates over the
  **user's own Supabase client** — Row-Level Security decides visibility; the
  model holds no keys. Result hrefs are minted server-side (K0-07); the model
  can only echo IDs, never mint destinations.
- **Provider settings.** Anthropic API traffic is **not used for training**;
  Klimr uses the zero-data-retention request path where available. No prompts
  or results are persisted at the vendor beyond the request lifecycle.
- **Kill switch.** `AI_SEARCH_DISABLED=1` (Vercel env) sheds AI search
  instantly; callers fall back to deterministic search. Courts degrade to
  intel-only results when the AI key is absent or the judge is down (K1-05).
- **Budgets & deadlines.** Per-user rate + daily ceiling; a 25s whole-run
  deadline and 12s per-round timeout bound cost and latency (K1-04).

## 9. Courts location handling (K1-08 · audit COURT-008)
- **Collection moments.** A ZIP/city entered in the courts search, or — only if
  the user taps **"Use my location"** — the browser's coordinate fix for that
  one search. Coordinates are never collected silently.
- **Coarsening.** Coordinate searches cache under a **~1 km bucket**
  (`ll:<lat2dp>,<lng2dp>`) so a precise fix is never stored or reused at full
  precision; nearby fixes share one cache envelope.
- **Non-persistence.** Live-play **join coordinates** (the geofence check) are
  evaluated server-side and **not persisted** to a member's record. The queue
  payload projection (K0-04) strips the geofence centre from non-organizer
  responses entirely.
- **Radius honesty.** The user's chosen radius is a hard bound on every search,
  filter, and cache key; results are never silently widened.

## 10. Access & export — what a complete export contains (ADD-10)

Deletion was specified above; **the right to KNOW and to PORTABILITY are
separate rights** under CCPA/CPRA and were missing from this document until the
August 6 verification pass caught it. A member may request a copy of their data,
and the answer must be complete — an export that silently omits a table is a
compliance failure that looks like a feature.

**A complete export contains every row keyed to the requester across:**

| Area | Objects |
|---|---|
| Identity | `profiles`, `auth.users` (email, created_at, sign-in metadata — never password/TOTP secrets) |
| Social | `connections` / follows / blocks (both directions), `invites` sent and redeemed |
| Content | `posts`, `comments`, `post_tags`, uploaded media URLs |
| Play | `event_registrations`, `tournament_registrations`, `queue_teams` + `queue_team_members` participation, match results, `rank_snapshots` rows for that user |
| Teams | memberships, roles, ownership |
| Commerce | marketplace listings, `class_providers` professional-status requests and their review outcome |
| Communications | chat threads the user is party to, notification preferences |
| Safety | reports the user filed; `admin_actions` rows targeting them, with staff identity redacted |
| Devices | `courtside_devices` rows only where the user is the session organizer |

**Excluded, and why — stated in the response, not silently dropped:**
- Other members' personal data inside shared objects (a chat has two parties;
  the export contains the requester's messages and the fact of the thread).
- Staff identities in moderation records — the outcome is disclosed, the
  reviewer is not.
- `deleted_users_ledger` entries about *other* people.
- Security material: TOTP secrets, `mfa_failed_verification_attempts`,
  `token_hash` values, session tokens.
- Derived operational data with no personal content (`perf_samples` stores no
  identity by design — see §7).

**Process:** acknowledge within 10 business days, deliver within 45 (one 45-day
extension with notice), verify identity first — the same clock as deletion.
Deliver as machine-readable JSON plus a plain-language index of what each file
contains, because portability that requires an engineer to interpret is not
portability.

**Implementation status: SPECIFIED, NOT BUILT.** Today an export is assembled
manually against this list. That is workable at pilot scale and is the honest
position; automate it before the member count makes manual assembly unreliable.
The object-level map in §7 is the authoritative source for what exists to
export, so the two must be updated together.
