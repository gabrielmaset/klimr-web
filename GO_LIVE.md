# Klimr — Deploy & Go-Live runbook

The full set of steps to deploy the current build and bring it live. Do them in order.
See `SECURITY.md` for the security posture behind several of these steps.

## 1. Push code
Re-sync the whole `klimr-web` folder to GitHub → Vercel auto-redeploys.
- This build changed **`package.json` + `package-lock.json`** (a `postcss` security
  override). Make sure BOTH land in the repo — Vercel installs from the lockfile.
- Do not commit `node_modules` or `.next`.

## 2. Run database migrations (Supabase SQL editor, in order)
Your base schema (`0001`–`0005`) is already live — it's what your current sign-in,
profiles, and rankings run on. Apply the rest, **each once, in order**:

- `0006_social_feed.sql` — posts/likes/comments, AI-moderation gate, `post-media` bucket (foundation for future user posting; the feed is system-curated for now)
- `0007_safety.sql` — `safety_incidents` (service-role only) + private `quarantine` bucket
- `0008_admin.sql` — admin roles, audit log, report triage, account suspend/ban
- `0009_preferences.sql` — per-user notification + privacy preferences (powers `/settings`)
- `0010_feed_items.sql` — curated system feed (results/news/announcements); seeds a welcome post
- `0011_chat.sql` — end-to-end encrypted, multi-device match chat (keys, conversations, wrapped keys, ciphertext). See `CHAT.md`.
- `0012_sponsorships.sql` — local-business sponsorships of top-ranked amateurs (powers `/sponsorships`); seeds sample sponsors
- `0013_notifications.sql` — per-user in-app notifications (powers `/notifications` + the bell badge)
- `0014_teams.sql` — player teams, membership, invitations (powers `/teams`)
- `0015_courts.sql` — court directory + community reviews (powers `/courts`); seeds Westside courts
- `0016_region_challenges.sql` — area-vs-area challenges (powers `/challenges`); standings computed live; seeds showcase matchups
- `0017_events.sql` — local events + RSVPs (powers `/events`); seeds upcoming events at the seeded courts
- `0018_marketplace.sql` — coaching & gear listings (powers `/marketplace`); curated, no payments; seeds sample listings
- `0019_marketplace_upgrade.sql` — adds sortable `price_cents` (backfills seeds) + `saved_listings`. Run after 0018.
- `0020_invite_owner.sql` — adds `owner_id` to `invite_codes` + own-code read policy
- `0021_investor_codes.sql` — investor access codes for the demo gate + the `generate_investor_codes()` minting function (codes valid 7 days)

(If you ever point at a brand-new Supabase project instead, run from `0001`.)

After `0011`, see `CHAT.md` for chat operational follow-ups (key-expiry cleanup job,
publishing device keys at sign-in, report-a-message, optional realtime).

**Verify (critical):** Supabase → Advisors → **Security Advisor** → confirm **zero
"RLS disabled in public" warnings**. RLS is inert until migrations run; this check
confirms every table is protected. This is the single most important post-migration step.

## 3. Environment variables (Vercel — server-side; mirror in `.env.local` for dev)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, already set.
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only, never `NEXT_PUBLIC`.** Powers admin, moderated publish, and gate-code validation.
- `GATE_SECRET` — **required for the access gates.** A long random string (e.g. `openssl rand -base64 32`). Without it the gate cookie falls back to a known value and becomes forgeable.
- `NEXT_PUBLIC_SITE_URL` — your production origin (e.g. `https://klimr.com`).
- `NEXT_PUBLIC_INVESTOR_DEMO_URL` — where the interactive demo is hosted (the investor page links here).
- `ANTHROPIC_API_KEY` — AI text/image safety screening (`MODERATION_MODEL` optional, default `claude-sonnet-4-6`).
- Media uploads (only if/when photos are re-enabled): `CSAM_SCAN_*`, `SAFETY_ALERT_WEBHOOK`, `NCMEC_REPORT_*` (see `SAFETY.md`). `SAFETY_DEV_BYPASS=true` is local-dev ONLY.

## 4. Supabase Auth configuration
- **Auth → URL Configuration:** set **Site URL** + **Additional Redirect URLs** to your production domain(s) ONLY. This blocks Host-header spoofing of the email-link redirect.
- **Auth → enable "Enable RLS on new tables"**, and turn on **leaked-key push protection** (GitHub secret scanning).
- Confirm Storage bucket policies: `avatars` is public-read by design; `post-media` + `quarantine` stay locked (unused while media is off).

## 5. Access gates (the two portals)
- **Generate investor codes** (SQL editor): `select * from public.generate_investor_codes(5, 'seed round');` — each is valid 7 days. (Main-site invite codes you already mint with `generate_invite_codes(...)`.)
- **`investor.klimr.com` subdomain:** add it as a domain on the Vercel project (same deployment) + the DNS record Vercel shows (CNAME/A). The app rewrites that subdomain's root into the investor flow automatically.
- **Disable Cloudflare Access** on the investor route/subdomain — otherwise visitors hit both the old Cloudflare login and the new in-app gate.

## 6. Grant yourself admin (DB-only)
```sql
insert into public.admin_users (user_id, role)
values ((select id from auth.users where email = 'gduran@klimr.com'), 'superadmin');
```

## 7. Before real external users
- **Resend custom SMTP** — Supabase's built-in SMTP rate limit (~a few emails/hour) blocks magic-link sign-in for outside users.
- **Vercel Pro + Supabase Pro** — commercial use, no project pausing, backups.
- **Test on real devices:** both gate flows (invite + investor codes, incl. 7-day expiry), signup code prefill, the investor subdomain, E2EE chat across two accounts, and the new screens/nav.
- If photos are ever re-enabled in the feed: ESP registration + a detection vendor + legal counsel before public launch (see `SAFETY.md`).
