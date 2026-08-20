# Security

_Last reviewed: 2026-06-17 · Internal code + schema audit (not a third-party penetration test)._
_Stack: Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + RLS + Auth + Storage) · Vercel._

This document records Klimr's security posture: the controls that are in place and
verified, the items that **must** be done before external users, a hardening backlog,
and the rules every future change must follow. It is paired with `docs/MIGRATIONS_LEDGER.md`
(operational launch checklist) — the migration-run requirement appears in both.

---

## 1. Posture summary

**Owner:** Gabriel Duran · **Last reconciled against source:** 2026-08-07 ·
**Reconcile again:** every release, and after every remediation batch.

Authorization is enforced in the database — Row-Level Security on every table,
privileged operations validated server-side, secrets server-only. That is the design,
and the design is sound.

**What this document no longer claims.** The August 2026 independent audit found that
several statements here described the intent rather than the code, and a control
document that overstates its controls is worse than none: it is the thing people cite
instead of checking. The absolute claims are gone. What replaces them is scope, status
and date — and for the countable ones, an automated assertion in
`tests/doc-claims.test.ts` that fails the build when this file and the source disagree.

Open findings from that audit, and their state, are tracked per-ID in the remediation
ledger. Nothing below should be read as "and therefore we are done".

The remaining real risk is **operational**: RLS and policies only protect the live database
once the migrations are applied, and two Supabase/Vercel dashboard settings must be
configured. See §4.

---

## 2. Threat model & researched attack classes

Reviewed against current known issues for this stack:

- **Missing/!disabled RLS (Supabase #1 risk).** Tables created via SQL default to RLS
  _off_; the pattern behind CVE-2025-48757 (large numbers of Supabase apps shipped with
  public-readable tables). → All tables enable RLS in migrations (§3).
- **service_role key exposure.** The service-role key bypasses all RLS. → Server-only (§3).
- **Permissive policies** (e.g. any authenticated user can write any row). → Per-user data
  is scoped to `auth.uid()`; only intentionally public reads use `authenticated` (§3).
- **Next.js middleware authorization bypass (CVE-2025-29927)** via the
  `x-middleware-subrequest` header. → Mitigated by version (16.2.7 > 15.2.3 patch) **and**
  host (Vercel strips the header) **and** defense-in-depth (authz also at the data layer).
- **SQL / PostgREST filter injection.** → Parameterized queries + bound RPC params; the one
  `.or()` search filter is character-whitelisted.
- **Account enumeration / phishing / account takeover.** → Passwordless sign-in (nothing to stuff or phish), uniform "sent" responses, TOTP MFA with a layered lockout — the DB-side MFA lockout hook (migration `0055`) plus the app-level policy in `verifyTotpAction` (5 wrong codes / 15 min) as defense-in-depth — no open
  redirects, identity verification at the gate.
- **XSS.** → React auto-escaping everywhere, plus write-time and render-time sanitisation on the rich-text surfaces. <!-- claim:xss-sinks=10 --> There are **10** `dangerouslySetInnerHTML` call sites, not zero; every one renders content that passed `lib/rich-text.ts` sanitisation or is server-generated (JSON-LD, sanitised tournament copy). The claim is "no unsanitised sink", which is checkable; "no `dangerouslySetInnerHTML`" was not true.
- **Re-enabling disabled features.** → Disabled server actions are not imported, so no
  endpoint is registered.

---

## 3. Controls in place (verified)

### Authentication
- **Passwordless only.** <!-- claim:password-auth=removed --> Sign-in is a magic link via
  Supabase Auth, **sign-in only** (`shouldCreateUser: false`) — new accounts require an
  invite at `/signup`. Password authentication is REMOVED: there is no password to phish,
  stuff, reuse, or leak, and `tests/doc-claims.test.ts` fails the build if a
  `signInWithPassword` call ever reappears.
- **Two-factor (TOTP) enforced**: middleware requires AAL2 on every protected route; pages
  needed to *complete* 2FA are exempt so users aren't locked out.
- **Anti-enumeration**: the magic-link flow always reports "sent" whether or not the
  address has an account. Email existence is never revealed.
- All traffic is HTTPS with HSTS (preload).
- Email confirmation runs through Supabase's token flows. (There is no password to reset.)

### Authorization
- **Row-Level Security on every table** — all feature tables and all core tables
  (`profiles`, `matches`, `player_sports`, `posts`, `blocks`, `reports`, …) `enable row
  level security`. Per-user data is gated with `auth.uid() = user_id`; intentionally public
  reads use `auth.role() = 'authenticated'`.
- **Admin model is locked down**: `admin_users` / `admin_actions` have RLS on with **no**
  user-facing policies and are revoked from `anon`/`authenticated`. The only read path is
  `current_admin_role()` — `SECURITY DEFINER`, pinned `search_path = public`, scoped to
  `where user_id = auth.uid()`. Users cannot read others' roles, self-promote, or tamper
  with the audit log.
- Every `/admin` server action calls `requireAdmin(<level>)` (support < admin < superadmin).
- Every privileged (service-role) action validates the caller and **scopes to their own
  data** — e.g. account deletion only deletes `user.id`; team/membership writes verify the
  caller is the captain before using the admin client.
- Write actions are gated by `accountActive()` (suspended/banned users cannot write).

### Secrets
- The service-role client (`lib/supabase/admin.ts`) is guarded by `import "server-only"`
  and reads `SUPABASE_SERVICE_ROLE_KEY` (not a `NEXT_PUBLIC_*` var). It can never be bundled
  into client code.
- Only the **anon** key is public — correct by design; security comes from RLS, not from
  hiding that key.

### Injection
- Supabase/PostgREST queries are parameterized; every RPC on the (now large) command
  surface uses bound, named params. No string-built SQL anywhere.
- The marketplace search builds a PostgREST `.or()` expression — its input is whitelisted to
  alphanumerics + spaces, so no filter metacharacters (`, ( ) %` or operators) can reach it.

### XSS / content
- 10 `dangerouslySetInnerHTML` sites, each fed by sanitised or server-generated HTML; all other user content renders as text (React
  auto-escapes). Chat is end-to-end encrypted, so message bodies are ciphertext at rest.

### Open redirect
- Both the login flow and the email-confirm route validate redirect targets with a
  `safePath()` that requires a single leading `/` and rejects `//…` (protocol-relative)
  targets. Unsafe values fall back to `/account` (or `/login`).

### HTTP headers (set in `next.config.ts`)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy` (default-src 'self'; `frame-ancestors 'none'`; restricted
  connect/img/frame sources; `upgrade-insecure-requests`)
- `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` ·
  `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
- `poweredByHeader: false` (framework not advertised)

### End-to-end-encrypted chat
- Per-match group chat uses Web Crypto: ECDH P-256 identity keys (private key
  non-extractable) with per-device key wrapping, and AES-GCM message encryption. The server
  stores only ciphertext + IVs and cannot read messages. (See `CHAT.md` for the full design
  and its documented tradeoffs.)

### Disabled features
- Invite-a-friend is **disabled**: the page shows "coming soon" and the functional server
  action is not imported anywhere, so Next.js registers no endpoint for it — it is
  unreachable, not merely hidden.

### Platform
- 18+ only. <!-- claim:video-disabled=true --> **Video** is disabled at the boundary (migration 0195): the `feed-media` MIME allowlist refuses video bytes and the `posts_reject_video` trigger refuses the row, for every role including `service_role`. **Photo upload is ENABLED** and gated by the CSAM hash-match seam plus the AI classifier, both fail-closed — the older blanket statement that user media is disabled has not been true since that pipeline shipped.

---

## 4. Pre-launch security checklist (gating — do before any external user)

- [ ] **Run ALL migrations in order** in the Supabase SQL editor — currently
      `0001`→`0297` <!-- claim:migrations-head=0297 --> per `docs/MIGRATIONS_LEDGER.md`.
      RLS, policies, and every command function only exist once applied;
      `tests/doc-claims.test.ts` fails the build when this range falls behind the
      `supabase/migrations/` directory.
- [ ] **Supabase → Advisors → Security Advisor: confirm zero "RLS disabled in public"
      warnings.** This is the single most important check.
- [ ] **Supabase → Auth → URL Configuration: set Site URL + Additional Redirect URLs to the
      production domain(s) only.** The email-link redirect derives from the request origin;
      this allowlist is what blocks a Host-header spoof from redirecting a login link to an
      attacker domain.
- [ ] **Vercel env**: `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are set as
      server-only (never `NEXT_PUBLIC_*`); set `NEXT_PUBLIC_SITE_URL` to the real origin.
- [ ] **Supabase → Auth → enable "Enable RLS on new tables"** and turn on leaked-key push
      protection / GitHub secret scanning.
- [ ] **Verify Storage bucket object policies** (`avatars` is public-read by design;
      `post-media` and the safety/quarantine bucket should stay locked while unused).
- [ ] **Supabase → Authentication → Hooks: enable "MFA Verification Attempt" →
      `public.hook_mfa_verification_attempt`.** Migration `0055` installs the function
      and grants, but the hook only RUNS once selected in the dashboard — its own header
      says so. Until then only the app-level lockout applies.
- [ ] Custom SMTP (Resend) configured — also a deliverability requirement.
- [ ] Vercel Pro for commercial use at launch. Supabase Pro: ACTIVE since Aug 2026 (backups, no pausing).

---

## 5. Hardening backlog (post-launch, lower priority)

- Move to a **nonce-based CSP** so `script-src 'unsafe-inline'` can be dropped.
- **Server-side AAL re-check** for sensitive admin operations (the middleware 2FA gate fails
  open on transient errors — see §6).
- Tune **Supabase Auth rate limits** (magic-link sends / OTP verifies).
- Adopt Supabase's **new API key model** (publishable + revocable secret keys) when migrating.
- Establish a **dependency-patch cadence** (Dependabot / `npm audit`) — the Next.js
  middleware CVE is a reminder to keep the framework current.
- Add basic **abuse monitoring** (failed-login spikes, unusual write volume).

---

## 6. Accepted risks (documented decisions)

- **CSP allows `script-src 'unsafe-inline'`** — required by the current Next.js setup.
  Accepted because there are no HTML-injection sinks and React auto-escapes; revisit with a
  nonce-based policy.
- **Middleware 2FA gate fails open** on a transient error reading the assurance level — a
  deliberate availability choice. Primary authentication and RLS still hold; only the
  secondary factor is skipped for that request.
- **`ranked_players` 'world' scope returns all players** — acceptable pre-launch; not a
  security issue (no private data), a scale consideration.

---

## 7. Rules for future changes (keep these true)

1. **Every new table MUST `enable row level security` and ship explicit policies** in the
   same migration. Default-deny first; add the narrowest policies needed.
2. **Privileged (service-role) writes must validate the caller's identity and authorization
   first**, and scope to the caller's own data. Never trust a client-supplied ID without an
   ownership/role check.
3. **Never import `lib/supabase/admin` into a client component.** It is server-only.
4. **No UNSANITISED `dangerouslySetInnerHTML`.** Render user-supplied content as text, or pass it through `lib/rich-text.ts` first. Adding a sink means updating the count in this file — `tests/doc-claims.test.ts` enforces that.
5. **Validate every redirect target** (relative path, single leading slash).
6. **Sanitize/whitelist any user input** used inside a PostgREST `.or()` / `.filter()` string.
7. **Keep the 18+ posture.** Keep **video** disabled until the media safety gate exists (KCDX-006); photo upload stays behind the fail-closed scanning seam.
8. New external dependencies and framework upgrades get a quick security look before merge.

---

## 8. Reporting a vulnerability

Please report suspected security issues privately to **hello@klimr.com** with steps to
reproduce. Do not open public issues or test against other users' accounts. We aim to
acknowledge reports promptly and will credit good-faith disclosures.
