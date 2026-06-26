# Security

_Last reviewed: 2026-06-17 · Internal code + schema audit (not a third-party penetration test)._
_Stack: Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + RLS + Auth + Storage) · Vercel._

This document records Klimr's security posture: the controls that are in place and
verified, the items that **must** be done before external users, a hardening backlog,
and the rules every future change must follow. It is paired with `GO_LIVE.md`
(operational launch checklist) — the migration-run requirement appears in both.

---

## 1. Posture summary

Klimr is **secure by design at the code/schema layer.** Authorization is enforced in the
database with Row-Level Security on every table, privileged operations validate the caller
server-side, secrets are server-only, and the classic attack classes for this stack
(missing RLS, service-role key exposure, SQL injection, open redirect, account enumeration,
admin self-promotion, XSS) were each checked and are closed.

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
- **Account enumeration / phishing / account takeover.** → Uniform auth errors, MFA, no open
  redirects, identity verification at the gate.
- **XSS.** → React auto-escaping, no `dangerouslySetInnerHTML`, E2EE chat ciphertext.
- **Re-enabling disabled features.** → Disabled server actions are not imported, so no
  endpoint is registered.

---

## 3. Controls in place (verified)

### Authentication
- Email + password and (optional) passwordless magic link via Supabase Auth. Magic link is
  **sign-in only** (`shouldCreateUser: false`) — new accounts require an invite at `/signup`.
- **Two-factor (TOTP) enforced**: middleware requires AAL2 on every protected route; pages
  needed to *complete* 2FA are exempt so users aren't locked out.
- **Anti-enumeration**: password login returns one generic message for wrong-password vs
  unknown-account; magic link always reports "sent". Email existence is never revealed.
- Passwords are never stored or processed by the app — Supabase handles hashing (bcrypt).
  All traffic is HTTPS with HSTS (preload).
- Email confirmation + password reset run through Supabase's token flows.

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
- Supabase/PostgREST queries are parameterized; the only RPC (`ranked_players`) uses bound
  named params. No string-built SQL anywhere.
- The marketplace search builds a PostgREST `.or()` expression — its input is whitelisted to
  alphanumerics + spaces, so no filter metacharacters (`, ( ) %` or operators) can reach it.

### XSS / content
- No `dangerouslySetInnerHTML` in the codebase; all user content renders as text (React
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
- 18+ only; user media (photo upload) is intentionally disabled until it is legally
  supported, which removes a large content-risk surface.

---

## 4. Pre-launch security checklist (gating — do before any external user)

- [ ] **Run migrations `0001`→`0020` in order** in the Supabase SQL editor. RLS, policies,
      and the admin/role functions only exist once applied.
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
- [ ] Custom SMTP (Resend) configured — also a deliverability requirement (see `GO_LIVE.md`).
- [ ] Vercel Pro + Supabase Pro for backups and to stop project pausing (see `GO_LIVE.md`).

---

## 5. Hardening backlog (post-launch, lower priority)

- Move to a **nonce-based CSP** so `script-src 'unsafe-inline'` can be dropped.
- **Server-side AAL re-check** for sensitive admin operations (the middleware 2FA gate fails
  open on transient errors — see §6).
- Tune **Supabase Auth rate limits** (sign-in / OTP / password-reset).
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
4. **No `dangerouslySetInnerHTML`.** Render user-supplied content as text.
5. **Validate every redirect target** (relative path, single leading slash).
6. **Sanitize/whitelist any user input** used inside a PostgREST `.or()` / `.filter()` string.
7. **Keep the 18+ posture and keep user media disabled** until it is legally supported.
8. New external dependencies and framework upgrades get a quick security look before merge.

---

## 8. Reporting a vulnerability

Please report suspected security issues privately to **hello@klimr.com** with steps to
reproduce. Do not open public issues or test against other users' accounts. We aim to
acknowledge reports promptly and will credit good-faith disclosures.
