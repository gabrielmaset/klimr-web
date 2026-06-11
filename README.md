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

Magic-link email sign-in is used. In your Supabase project:

1. Authentication -> Providers: Email is on by default (magic link works out of the box).
2. Authentication -> URL Configuration: set the Site URL and add a Redirect URL for
   `http://localhost:3000/auth/confirm` (and your deployed `https://.../auth/confirm`).

## Build roadmap

- Phase 0 — skeleton (done): Next.js + Tailwind baseline, app shell, reserved ad slots.
- Phase 1 — database & types (done): Supabase schema + RLS + `ranked_players` + generated types.
- Phase 2 — accounts & profile (done): magic-link auth, route protection, onboarding, and the verification stub with an admin-approval path.
- Phase 3 — rankings (next): per-sport list + ZIP -> world zoom (reads `ranked_players`).
- Phase 4 — matches: create + two-sided confirm + void-on-dispute.
- Phase 5 — open play + waitlist: board + join requests + auto-promote.
- Phase 6 — safety: block/report + filtering.

See `Klimr_MVP_Build_Scope.md` for the full scope and data model.

## Design system

The web app carries the Klimr brand from the investor demo into product UI:

- **Palette** — paper `#FAFAFA`, ink `#0A0A0B`, signal orange `#FF4E1B`, pop yellow `#FFE249` (pending states), hairline rules `#E4E4E7`.
- **Type roles** — Instrument Serif (display), Archivo Black (kickers), DM Sans (body), JetBrains Mono (points, ZIPs, emails). Self-hosted via `@fontsource` packages: no runtime Google Fonts dependency.
- **Motion** — functional only: load stagger, hover lift, press feedback. `prefers-reduced-motion` disables everything. Keyboard focus is always visible.

## Environment variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Optional: `NEXT_PUBLIC_SITE_URL` (magic-link fallback origin + metadata base), `NEXT_PUBLIC_INVESTOR_DEMO_URL` (when set, /investors links straight to the deployed interactive demo).
