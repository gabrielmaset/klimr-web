# Klimr — Go-Live runbook (detailed)

Step-by-step instructions to deploy the current build and bring it live. Each step
says exactly where to click and what to paste. Do them in order. `SECURITY.md` has
the security reasoning behind several of these.

A note on order: Steps 1–2 get the code and database live. Step 3 makes the app
actually work (without the env vars it can't talk to Supabase). Steps 4–6 turn on
the access gates and admin. Step 7 is what's required before real outside users.

---

## Step 1 — Push the code to GitHub

1. Sync the **entire `klimr-web` folder** to your GitHub repo (your usual upload).
2. This build changed **`package.json`** and **`package-lock.json`** (a security
   fix to the `postcss` dependency). Make sure **both** files are included — Vercel
   installs from `package-lock.json`, so the fix only takes effect if it's there.
3. Do **not** upload the `node_modules` or `.next` folders (they're rebuilt by Vercel).
4. Vercel is connected to the repo, so pushing triggers an automatic redeploy. You
   don't deploy manually.

---

## Step 2 — Run the database migrations (Supabase)

Migrations are SQL files that build your database tables and security rules. Your
base schema (`0001`–`0005`) is **already applied** — it's what your current sign-in
and rankings run on. You only need to run `0006` through `0022`, **once each, in order**.

**How to run one:**
1. Open your project at **supabase.com** → in the left sidebar click **SQL Editor**.
2. Click **"+ New query"**.
3. Open the migration file (e.g. `supabase/migrations/0006_social_feed.sql`), copy
   **all** of its text, and paste it into the editor.
4. Click **Run** (or press Ctrl/Cmd + Enter). Wait for **"Success"**.
5. Repeat for the next file. Order matters — don't skip or reorder.

**Run these, in this order:**
`0006` · `0007` · `0008` · `0009` · `0010` · `0011` · `0012` · `0013` · `0014` ·
`0015` · `0016` · `0017` · `0018` · `0019` · `0020` · `0021` · `0022`

What the later ones add: `0011` = encrypted match chat · `0013` = notifications ·
`0014` = teams · `0015` = courts · `0016` = region challenges · `0017` = events ·
`0018`/`0019` = marketplace · `0020` = invite-code ownership · `0021` = investor
access codes + the `generate_investor_codes()` function · `0022` = security hardening
of database functions (no behavior change).

**Then verify (the most important check):**
- In the top toolbar (or left sidebar) open **Advisors → Security Advisor**.
- Confirm the **Errors** count is **0**. (Warnings are fine — see `SECURITY.md`;
  the only ones that matter, "RLS disabled", show up as Errors.)

---

## Step 3 — Set the environment variables (Vercel)

Environment variables are secret settings the app reads at runtime (database keys,
etc.). They live in Vercel, **not** in the code.

### 3a. Where to add them
1. Go to **vercel.com** → open your **Klimr Web** project.
2. Click **Settings** (top nav) → **Environment Variables** (left sidebar).
3. For each variable below: type the **Name** exactly as shown, paste the **Value**,
   and under environments tick **Production**, **Preview**, and **Development**
   (all three), then click **Save**.
4. **Important:** after adding or changing variables you must **redeploy** for them to
   take effect. Go to the **Deployments** tab → open the latest → **⋯ → Redeploy**.

### 3b. The variables

| Name (exact) | What it is | What to paste | Already set? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project's address | `https://<your-project>.supabase.co` | Probably yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for the browser | Your **Publishable key** (`sb_publishable_…`) or legacy **anon** key | Probably yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** server key — never public | Your **Secret key** (`sb_secret_…`) or legacy **service_role** key | Probably yes |
| `GATE_SECRET` | Signs the access-gate cookies | A long random string you create (see 3d) | **No — add this** |
| `NEXT_PUBLIC_SITE_URL` | Your live address | `https://klimr.com` | Add if missing |
| `NEXT_PUBLIC_INVESTOR_DEMO_URL` | Link to the interactive demo | The URL where the demo is hosted | Add if missing |
| `ANTHROPIC_API_KEY` | AI safety screening (optional) | A key from console.anthropic.com | Optional |

### 3c. Where to find the Supabase keys
Supabase recently renamed these. In your project: **Settings → API Keys**.
- The **Publishable and secret API keys** tab has the new keys: copy the
  **Publishable** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the **Secret** key
  into `SUPABASE_SERVICE_ROLE_KEY`.
- Older projects also show a **Legacy API Keys** tab with `anon` and `service_role` —
  those still work (use `anon` for the public var, `service_role` for the secret var).
- The project URL is on the same page (or the **Connect** button at the top).
- These three are likely already set from when you first deployed — just confirm
  they exist and are correct. The **secret/service_role key must never** be in a
  `NEXT_PUBLIC_…` variable.

### 3d. Creating `GATE_SECRET`
This signs the cookies for the invite/investor portals, so it just needs to be long
and random. Generate one any of these ways, then paste the result as the value:
- Mac/Linux terminal: `openssl rand -base64 32`
- Or any password manager's "generate password" (40+ characters).
Keep it private (it's a normal variable, **not** `NEXT_PUBLIC_`). If it's ever missing,
the gates still work but the cookie becomes guessable — so set it before going live.

### 3e. Local development (optional)
To run the app on your own machine, create a file named **`.env.local`** in the
project root with the same `NAME=value` lines (one per line). This file is ignored by
Git and never uploaded. You don't need this just to deploy.

---

## Step 4 — Configure Supabase Auth

1. In Supabase, left sidebar → **Authentication** → **URL Configuration**.
   - **Site URL:** `https://klimr.com`
   - **Redirect URLs:** add `https://klimr.com/**` (and `https://investor.klimr.com/**`).
     This is what makes email sign-in links trustworthy and blocks spoofed redirects.
2. Still under **Authentication**, find **"Enable Row Level Security on new tables"**
   and turn it **on** (protects any table you add later by default).
3. **Leaked password protection** (rejects breached passwords) lives under
   **Authentication → Sign In / Providers → Password** — note this toggle requires the
   **Pro plan**, so it folds into the Pro upgrade in Step 7. Fine to skip while testing.

---

## Step 5 — Turn on the access gates

1. **Create investor codes.** Supabase → **SQL Editor** → new query → run:
   ```sql
   select * from public.generate_investor_codes(5, 'seed round');
   ```
   It returns 5 codes (each valid 7 days). Share one with an investor. Deactivate
   early with: `update public.investor_codes set active = false where code = 'INV-…';`
   (Main-site invite codes you mint the same way with `generate_invite_codes(...)`.)
2. **Set up `investor.klimr.com`.** Vercel → your project → **Settings → Domains** →
   add `investor.klimr.com`. Vercel shows the exact DNS record (a CNAME) to add at
   your domain registrar. Once it verifies, the app automatically routes that
   subdomain to the investor flow.
3. **Disable Cloudflare Access** on the old investor route/subdomain — otherwise
   visitors hit both the old Cloudflare code prompt **and** the new in-app gate.

---

## Step 6 — Make yourself an admin

Supabase → **SQL Editor** → new query → run (uses your real email):
```sql
insert into public.admin_users (user_id, role)
values ((select id from auth.users where email = 'gduran@klimr.com'), 'superadmin');
```
This unlocks the `/admin` area for your account only.

---

## Step 7 — Before real outside users

These aren't needed for your own testing, but are required before inviting real people:

1. **Resend custom SMTP.** Supabase's built-in email has a low hourly limit that
   blocks magic-link / confirmation emails for outside users. Create a Resend account,
   verify your domain, then in Supabase → **Authentication → Emails / SMTP** enter the
   Resend SMTP settings.
2. **Upgrade to Supabase Pro** (daily backups, no auto-pausing of the project) and
   **Vercel Pro** (commercial use). Leaked-password protection (Step 4.3) turns on here.
3. **Test on real devices:** both portals (invite code + investor code, including the
   7-day expiry), the code prefilled on the signup screen, the investor subdomain, and
   encrypted chat between two accounts.
4. If you ever re-enable photo uploads in the feed: ESP registration + a content-
   detection vendor + legal counsel first (see `SAFETY.md`).

---

## Quick checklist
- [ ] Code (incl. `package.json` + `package-lock.json`) pushed to GitHub
- [ ] Migrations `0006`→`0022` run in order; Security Advisor shows **0 errors**
- [ ] Env vars set in Vercel (incl. **`GATE_SECRET`**) and **redeployed**
- [ ] Supabase Auth Site URL + Redirect URLs set; RLS-on-new-tables on
- [ ] Investor codes generated; `investor.klimr.com` added in Vercel + DNS; Cloudflare Access off
- [ ] Yourself granted `superadmin`
- [ ] (Before outside users) Resend SMTP + Supabase Pro + Vercel Pro + device testing
