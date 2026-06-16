# Klimr — web app

Per-sport rankings from your ZIP to the world, verified players, real match results. Built on Next.js + Supabase.

Built in phases, each one build-checked before the next.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui conventions (`cn()` in `lib/utils.ts`)
- Supabase (Postgres + Auth + Storage + Realtime + RLS)
- Hosting: Vercel

## Prerequisites

- Node.js 20+ (built on Node 22)
- npm
- A GitHub repo (you own it)
- A Supabase project (free tier) — needed from Phase 2 on
- Later: a Vercel account

## Run it locally

    npm install
    cp .env.example .env.local   # then fill in your Supabase keys
    npm run dev

Open http://localhost:3000. The home page and /login work without keys; signing in needs the Supabase values below.

## Build — the per-phase check

    npm run build

This must pass clean. It is the gate for every phase.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project (Settings -> API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same place
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never exposed to the browser
- `NEXT_PUBLIC_SITE_URL` — optional; your deployed URL, used as a magic-link redirect fallback

`.env.local` is gitignored. Never commit real keys.

## Database

Apply the schema in `supabase/` to your project — see `supabase/README.md`.

## Auth setup (Supabase)

Sign-in is **email + password** (primary) with a **magic link** kept as an option, and **two-factor (TOTP) is required** for every account. Sign-up stays **invite-only** (the `handle_new_user` trigger consumes the invite code carried in signup metadata).

In your Supabase project:

1. **Authentication → Providers → Email:** turn ON **"Confirm email"** (no active account until the address is verified). Email/password is enabled by default.
2. **Authentication → Password policy:** turn ON **leaked-password protection** (HaveIBeenPwned) and set **minimum length 10**.
3. **Authentication → Multi-factor:** enable **TOTP** (the app enrolls + challenges via `supabase.auth.mfa`).
4. **Authentication → URL Configuration:** set the Site URL and add Redirect URLs for
   `http://localhost:3000/auth/confirm` and your deployed `https://.../auth/confirm`. The
   same callback handles email confirmation, magic link, and password recovery.

First-run loop: enter an invite code + email → confirm your email → create a password (the email is locked to the invited address) → set up 2FA (scan QR, enter code) → onboarding → account. If you ever lock yourself out during testing, delete your TOTP factor under **Authentication → Users**.

## Build roadmap

- Phase 0 — skeleton (done): Next.js + Tailwind baseline, app shell, reserved ad slots.
- Phase 1 — database & types (done): Supabase schema + RLS + `ranked_players` + generated types.
- Phase 2 — accounts & profile (done): email+password & magic-link auth, required TOTP two-factor, password reset, profile photos, route protection, onboarding, and the verification stub with an admin-approval path.
- Phase 3 — rankings (next): per-sport list + ZIP -> world zoom (reads `ranked_players`).
- Phase 4 — matches: create + two-sided confirm + void-on-dispute.
- Phase 5 — open play + waitlist: board + join requests + auto-promote.
- Phase 6 — safety: block/report + filtering.

See `Klimr_MVP_Build_Scope.md` for the full scope and data model.

## Design system

The web app carries the Klimr brand from the investor demo into product UI:

- **Palette** — paper `#FAFAFA`, ink `#0A0A0B`, signal orange `#FF4E1B`, pop yellow `#FFE249` (pending states), hairline rules `#E4E4E7`.
- **Type roles** — Fraunces 600 (logotype only), Instrument Serif (display), Archivo Black (kickers), DM Sans (body), JetBrains Mono (points, ZIPs, emails). Self-hosted via `@fontsource` packages: no runtime Google Fonts dependency.
- **Motion** — functional only: load stagger, hover lift, press feedback. `prefers-reduced-motion` disables everything. Keyboard focus is always visible.

## Environment variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Optional: `NEXT_PUBLIC_SITE_URL` (magic-link fallback origin + metadata base), `NEXT_PUBLIC_INVESTOR_DEMO_URL` (when set, /investors links straight to the deployed interactive demo).

## Brand

The Klimr mark is "The Climb": a staircase with the wordmark's orange period elevated above the top step — the player at the top of their block. `components/logo.tsx` exports `<KlimrMark/>` and `<KlimrLogo/>`; standalone assets (mark, white/mono variants, app tile, lockups) live in `public/brand/`. The favicon is `app/icon.svg`.
