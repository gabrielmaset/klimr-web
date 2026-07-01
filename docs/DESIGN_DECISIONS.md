# Klimr — Design Decisions & UI Conventions

The single source of truth for how Klimr looks and behaves. Read this before adding
or changing any UI so the site stays consistent. When you make a design or layout
decision, **add it here** (and add a dated entry to the Change Log at the bottom).

---

## 1. Layout & width

- Every page uses **full desktop width**: `mx-auto max-w-page` (80rem). Never trap a
  page in a narrow mobile-style centred column on desktop.
- Standard page padding: `px-5 py-8 sm:py-10`.
- Prefer multi-column layouts where content allows. Card grids: `grid gap-3
  sm:grid-cols-2 lg:grid-cols-3`.
- **Pair compact panels side by side** rather than stacking full-width boxes that
  hold little content (`grid items-start gap-4 lg:grid-cols-2`). Full-width is for
  content that earns it (long lists, actionable queues).

## 2. Color tokens (never hardcode these as raw hex)

| Token | Use |
| --- | --- |
| `text-ink` / `text-ink-soft` | Primary / secondary text |
| `text-mute` / `text-faint` | Tertiary / quaternary text, muted labels |
| `bg-surface` | Card surface |
| `bg-bg` | Page / recessed surface |
| `border-rule` | Default hairline border |
| `bg-tint-brand`, `text-brand`, `text-brand-deep` | Brand (Klimr orange) tint + text |
| `text-pop` | Owner crown / accent gold |
| `text-success`, `bg-tint-success` | Positive / "joined" states |

Danger red is `#dc2626` (hover `#b91c1c`) with `#fef2f2` tint — the one place raw
hex is used, kept consistent across cancel/disband flows.

## 3. Typography

- `font-display` — **Fraunces**, big headings (`text-4xl`/`text-5xl`).
- `font-athletic` — **Oswald** (condensed, uppercase-friendly). Section headers and
  team names. Section header pattern: `font-athletic text-base font-bold uppercase
  tracking-wide`.
- `font-mono` — **JetBrains Mono**. Codes, IDs, verification strings.
- `kicker` — small all-caps label class.
- **Unicode:** write real characters (`—`, `→`, `'`, `"`) directly in JSX. Never use
  `\uXXXX` escapes inside JSX text or attributes — JSX does not interpret them and
  they render literally (this caused the `\u2014` bug in the cancel dialog). Escapes
  are only safe inside JS string literals in `{…}` or `.ts` files.

## 4. Shape & elevation

- Cards: `rounded-2xl` (or `rounded-3xl` for large feature cards).
- Pills / buttons: `rounded-full`. Chips: `rounded-md` / `rounded-lg`.
- Interaction utilities: `.press` (tactile press on tap), `.lift` (hover lift on
  linked cards). Use `hover:shadow-[0_2px_18px_-6px_rgba(0,0,0,0.12)]` for a soft
  card hover where `.lift` isn't used.

## 5. Buttons

- **Primary (brand):** `bg-brand text-white hover:bg-brand-deep`.
- **Dark:** `bg-ink text-surface hover:bg-ink-soft`.
- **Secondary/outline:** `border border-rule bg-surface text-ink hover:border-brand`.
- All get `.press` and `rounded-full`. Icons from **lucide-react**, ~13–18px.

## 6. Component patterns

- **Destructive confirmation (`components/danger-confirm.tsx`):** two-factor — type a
  fixed word (CANCEL/DELETE) **and** a random code. Rules: input placeholders are
  neutral hints ("Type it here" / "Enter the code") and **never echo the answer**.
  The word-to-type and the code are shown as chips above the inputs — the word in a
  light chip (`bg-ink/[0.07]`), the code in a high-contrast dark chip (`bg-ink
  text-white`, `text-base`, letter-spacing `0.12em` — spaced enough to read, tight
  enough to scan).
- **Sport accent dots:** each sport has a dot color for badges — tennis `#84cc16`,
  pickleball `#eab308`, padel `#3b82f6`, racquetball `#8b5cf6`, beach volleyball
  `#f97316`. (Defined in `app/teams/page.tsx` as `SPORT_DOT`.)
- **Team cards (Teams hub):** sport badge (dot + name) + role label on top; crest +
  name + `N members · place`; a RANK / LAST 5 stat strip; a next-match / "Schedule a
  match" footer. See §7 for the data caveat.
- **Maps (`components/event-location-map.tsx`):** keyless Google embed via `?q=…
  &output=embed`. Precision order: precise `point` (from a resolved Maps link) →
  street address + ZIP → venue name → stored lat/lng. When only a pasted Google
  Maps link exists, `lib/maps-url.ts` parses coordinates from the URL (or resolves a
  goo.gl short link server-side) so the pin lands exactly. A transparent anchor over
  the embed opens the full map.

## 7. Honest empty states (important)

Do not render invented data as if it were real. Klimr has **no team-vs-team match,
scheduling, or ranking model yet** (`/team/[teamId]/matches` is a "coming soon"
stub). So on the Teams hub, RANK shows "Unranked", LAST 5 shows empty placeholder
chips, and the footer invites "Schedule a match" — all honest until a team-
competition backend exists. Same principle everywhere: show real data or an honest
empty/placeholder state, never fabricated numbers.

---

## Change Log

### 2026-07-01 — Teams refinement + fixes batch
- **Cancel/DangerConfirm dialog:** fixed literal `\u2014` rendering (real em-dash
  now); neutral input placeholders that no longer reveal the answer; CANCEL/DELETE
  word shown as a light chip and the code as a larger high-contrast dark chip with
  reduced letter-spacing for legibility.
- **Systemic em-dash fix:** replaced literal `\u2014`/`\u2192` escapes with real
  characters across all `.tsx` files (JSX render bug).
- **Event organizer tools:** Live queue + Event admins are compact → now paired in a
  2-col grid on `lg`; pending join-requests moved full-width above them.
- **Event map:** added `lib/maps-url.ts`; the embed pin now uses the exact
  coordinate parsed/resolved from the organizer's pasted Google Maps link instead of
  geocoding the city.
- **Teams hub:** redesigned cards (sport badge + per-sport dot, role label, crest,
  members · place, RANK/LAST 5 strip, next-match/Schedule footer); added summary
  pills (teams / owned / sports), a top-right **Create team** button, a two-CTA
  "Start your own team" card, and sport-filter chips + live count on discovery.
  RANK / LAST 5 / next-match are honest empty states (see §7).
- **DB invariant:** team roster cap now enforced by a database trigger (migration
  `0090_team_size_guard.sql`) so no path — app, SQL, or seed — can exceed a team's
  cap; existing over-cap demo teams reconciled non-destructively.
