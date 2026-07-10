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
