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

Danger / warning / info are now **tokens** (previously raw hex): `text-danger` /
`bg-danger` / `bg-tint-danger` (hover `bg-danger-deep`), plus `warning` and `info`
with tints. Don't hardcode `#dc2626` etc. anymore — use the tokens.

**Per-sport accents.** Each sport has a fixed accent token — `--color-sport-tennis`
(green), `-pickleball` (gold), `-padel` (blue), `-racquetball` (violet), and `-beach`
(teal, the slug for `beach_volleyball`). Don't apply these ad-hoc — use `<SportChip>` /
`<SportDot>` (components/sport-chip.tsx), which tint correctly via `color-mix`. This is
*sport* identity, separate from the per-team generated kits in `lib/team-kit.ts`.

**Elevation.** `shadow-e1` (resting card), `shadow-e2` (raised / hover), `shadow-e3`
(popover / modal). Prefer these over one-off `shadow-[…]`.

**Radius roles.** `rounded-control` (≡ xl), `rounded-card` (≡ 2xl), `rounded-pill` are
semantic aliases over the raw scale; existing `rounded-xl/2xl/3xl/full` remain valid.

## 3. Typography

- `font-display` — **Inter** (variable): the UI + headline voice, with headline
  weight, tight tracking, and tabular figures (see the `.font-display` class). Big
  headings `text-4xl`/`text-5xl`. *(Inter replaced Fraunces as the display face;
  Fraunces is now the **logotype only** — the `.logotype` class / components/logo.tsx.)*
- `font-athletic` — **Oswald** (condensed, uppercase-friendly). Section headers,
  team / scoreboard, rank numbers. Pattern: `font-athletic text-base font-bold uppercase
  tracking-wide` — or use `<SectionHeader>`. Lean on this *more*, not less: it's the
  athletic voice and is currently underused relative to `kicker`.
- `font-mono` — **JetBrains Mono**. Codes, IDs, verification strings, stat figures.
- `kicker` — small all-caps micro-label. Powerful but easy to overuse; don't let it
  become the only hierarchy device on a page.
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

Do not render invented data as if it were real. Show real data or an honest
empty/placeholder state, never fabricated numbers. (Historical example: before the
team-competition backend existed — it shipped in migration `0092` — the Teams hub
showed RANK "Unranked" and empty LAST 5 chips rather than fake stats. Team-vs-team
results are now real; the principle stands for every future surface, e.g. the
tournament page's `WeatherComingSoon` state when an event is beyond the ~16-day
Open-Meteo forecast horizon.)

## 8. Scoped page themes

The app's tokens (§2–3) are the default everywhere. A page may carry its own
self-contained theme **only** when it is a public, outward-facing artifact with its
own audience — and the theme must be scoped so it can't leak:

- **Tournament public page (`/e/[code]`)** — warm kraft editorial palette (bg
  `#F6F6F2` · paper `#FCFCFA` · ink `#17190F` · orange `#E4713A` · deep `#8E4720` ·
  gold `#C99A12` · olive `#3F6314`), fonts **Hanken Grotesk Variable** +
  **Space Mono**, all under the `.tp` / `.tp-mono` classes in `app/globals.css`.
  Two-column layout with a sticky dark registration sidebar; photographic hero.
- Everything else stays on the core tokens. When in doubt: core tokens.

## 9. Social & relationship UI

- **Relationship buttons** (`components/relationship-buttons.tsx`) are optimistic:
  the label flips instantly, the server action runs in a transition, and on failure
  the state rolls back with the reason inline (cooldown / rate limit /
  unavailable). Never leave a button in a lying state.
- **Context chips** explain *why* two players are shown together ("3 mutual
  connections · Both on Westside Smash · Played together 3×") — built only from
  information both profiles already display. Strongest signal first, max 3 chips
  (`buildContextChips` in `lib/social.ts`).
- **Blocking is silent and total**: a blocked pair never sees each other in search,
  suggestions, or profiles ("This profile isn't available" — same as a missing
  account). Never announce a block to the blocked person.
- **Team terminology by category:** recreational teams have a **Team manager**
  (the creator) + **Players** — never Owner/Manager/Staff labels, which are
  Pro-team club structure only.

---

## 10. Shared primitives (use these instead of re-styling)

Prefer these over hand-rolled markup so surfaces converge by construction:

- **`<Button>`** + **`buttonVariants({variant,size})`** (components/button.tsx) —
  variants `primary` · `dark` · `secondary` · `ghost` · `danger` · `soft`; sizes
  `sm`/`md`/`lg`. Pill shape, `.press`, and disabled handling are built in. Use
  `buttonVariants` on `<Link>` / `<a>` so they match the exact same styling.
- **`<Card>`** + **`cardClasses({pad,radius,interactive,elevated})`**
  (components/card.tsx) — the standard surface (`rounded-2xl border border-rule
  bg-surface`); `interactive` adds `.lift`, `elevated` adds `shadow-e1`.
- **`<SportChip>` / `<SportDot>`** (components/sport-chip.tsx) — per-sport identity.
- **`<SectionHeader>` / `<Stat>` / `<EmptyState>`** (components/primitives.tsx) —
  the athletic section label, mono stat figures, and the honest dashed-card empty
  state with an optional branded CTA.

Introduced in the Phase-2 design-system pass. Adoption across existing pages happens
surface-by-surface in later phases; **new code should use these from the start.**

---

## Change Log

### 2026-07-07 — Phase 2: design-system foundations
- **Reconciled this doc with the code.** Corrected the type system — `font-display`
  is **Inter**, not Fraunces (Fraunces is logotype-only). Removed the stale claim that
  danger was "the one place raw hex is used": an audit found **863 hex literals across
  96 files**; token migration runs surface-by-surface in later phases.
- **New token layers** (additive, in `@theme`, zero risk to existing utilities):
  semantic status (`danger` / `warning` / `info` + tints), per-sport accents
  (`--color-sport-*`, incl. `beach`), an elevation scale (`shadow-e1..e3`), and radius
  roles (`rounded-control/card/pill`).
- **New primitives:** `Button`/`buttonVariants`, `Card`/`cardClasses`,
  `SportChip`/`SportDot`, `SectionHeader`/`Stat`/`EmptyState`. Each codifies a pattern
  already dominant in the codebase (pill buttons, `rounded-2xl` cards, the dashed empty
  state), so adoption is a faithful convergence — not a restyle.
- No existing pages were changed — foundations only; lint + build stay green.

### 2026-07-07 — Visual pass V1 (global feel) — depth, athletic voice, chrome
- **Depth is on, app-wide.** Resting cards carry `shadow-e1` (297 instances across 126 files via a
  guarded transform — skipped anything already shadowed, dashed empty-states, and the tournament
  theme); the `Card` primitive now bakes `e1` in (`elevated` raises to `e2`); `.lift`'s hover
  elevation now uses the `--shadow-e2` token. One token family drives all depth.
- **Athletic voice on the flagships.** `/me`'s four section headers moved off kicker-as-header onto
  the Oswald pattern (the teams-hub model); the feed rail headers likewise; `/me`'s scoreboard stat
  values render in condensed athletic weight.
- **Chrome is one family.** The desktop top bar is now rounded-3xl frosted glass with `shadow-e2`
  and a rail-matched gutter — fixing the rail/top-bar seam — and its presence dots + next-match
  chip joined the tokens (file at zero hex).

### 2026-07-07 — Post-refinement follow-ups (recommendations applied)
- **`/me`'s local `SPORT_COLOR` map retired.** A module-level `sportTint(key, pct)` helper now
  derives tints from the sport tokens via `color-mix` at the old hex-alpha strengths (8/12/15%),
  and solid accents use `var(--color-sport-…)`. With the teams-hub map already deleted, the
  **tokens are now the only sport-colour source in the codebase.**
- **Invites sport identity:** `InviteItem` carries `sportKey`; friend / team / match invite rows
  render a `SportDot` before the sub line (friend subs drop the raw emoji).
- **Admin destructive controls → `danger`.** The Ban and Archive buttons use the danger token
  (one destructive language app-wide, per §"destructive actions"). The `banned` *status label*
  stays `brand-deep` — it's a label, not a control.
- **Image policy (resolves the `next/image` recommendation):** raw `<img>` is *correct* for
  blob/object-URL previews (croppers, upload editors), data-URL images (the MFA QR), small logos
  and avatars (≤64px), and the scoped tournament theme. `next.config.ts` already allows
  `*.supabase.co` via `remotePatterns`; converting the large **event covers/heroes** to
  `next/image` needs `fill`-parent restructuring and real-browser verification, so it stays an
  owner-tested backlog item rather than a blind change.
- Verified by a full error sweep (artifact greps, `color-mix` well-formedness, global invariants)
  which caught and fixed one real break (two solid-accent uses missed in the `/me` conversion).
  **Full-repo ESLint exit 0 · build exit 0.**

### 2026-07-07 — Phase 7 (final QA & report) — design refinement complete
- **QA fixes:** two page-level `max-w-6xl` containers (admin layout, rankings board) brought onto
  the `max-w-page` rule; the tournaments-list status map onto exact tokens (`success` / `warning` /
  `info` / `danger` / `mute`, published card → `surface`); the live-queue client normalised onto the
  established status tokens (the court-display **LED art set** stays whole, like the team scoreboard).
- **Verified:** zero real missing-alt images (grep hits were icon components); `:focus-visible` and
  `prefers-reduced-motion` intact; `--bottom-nav-h`, safe-areas, and the rail breakpoint behaviour
  confirmed; **zero new npm dependencies across the entire effort**.
- **Final numbers:** hex 863 → 593 (381 outside the scoped tournament theme, −56% in the app
  proper); files-with-hex 96 → 53; arbitrary neutral colour classes 40 → **0** repo-wide; one
  sport-colour source of truth. Every remaining hex is a classified, documented exception.
- Full report: `Klimr_Design_Refinement_Phase7_Report.md` (outputs). **Full-repo ESLint exit 0 ·
  build exit 0 · 114 routes.** Phases 1–7 complete.

### 2026-07-07 — Phase 6 (remaining surfaces + repo-wide consistency sweep) — complete
- **Communication:** the chats inbox avatar is now **sport-tinted** (matching Play — chats are match
  chats) and sits at zero hex; notifications' `friend_request` normalised onto the `info` tokens
  (the map was otherwise already tokenized by its author — achievement gold and two no-token inks
  stay); the feed's promo-gradient brand stop tokenized (its four-tone type set stays whole, like
  the invites set; feed cards already used `SportDot`).
- **Explore family** (marketplace, classes, resources, sponsorships): **zero hex across all nine
  files.** Class cards/rows/detail and the resources index + per-sport pages show sport emojis in
  **sport-tinted boxes** (each sport in its own colour); marketplace neutrals onto `bg`.
- **Settings + admin + search:** presence dots, the preferences toggle and segmented control, the
  admin dashboard stats and online dots, all four admin **status-tone maps** (reports / support /
  tournaments / users → `brand-deep` / `warning` / `success` / `mute` / `info`), the Urgent badges
  (→ `danger` tokens), verification-pending badge, and diagnostics warn tone — all onto tokens.
  The recurring `#0e7490` **admin cyan stays** as the one deliberate accent.
- **Repo-wide neutral sweep:** every `bg-[#f4f4f5]` / `bg-[#fafafa]` / `bg-[#f6f6f7]` arbitrary
  class (40 occurrences across 28 files, incl. account, archive, invite, support, chat room, team
  pages, top-bar, command palette, log viewer, setup wizard) → `bg-bg`. The scoped tournament
  theme has none and was untouched.
- Help was already clean; the invites browser's three-tone set stays bespoke (documented in
  Phase 4/5 policy). Lint green across every touched file; build green.

### 2026-07-07 — Phase 5 (teams, events, courts, play, challenges) — complete
- **Play flow** (`/play`, `/play/[id]` + MatchInvite, `/play/new` + court picker): fully on the
  system, **zero hardcoded hex**. Match cards and the match-detail header show the sport as an
  emoji in a **sport-tinted icon box** (`color-mix` on the sport token); status pills, the
  participant "you" row, the sport selector, and the format toggle run on tokens.
- **Challenges** (list + detail): sport labels → `SportChip`; the region-vs-region tug-of-war bar
  keeps its deliberate two-tone concept with track + home side on tokens (the away-side dark
  `#3f3f46` is the one intentional bespoke per page).
- **Events detail** (`/events/[id]`): cancelled / ended / full states, the waitlist button + card
  (→ the `warning` tokens, matching the network precedent), the live-queue banner, and hovers on
  tokens (15 → 7 hex). Deliberately kept: WhatsApp's own brand colours, the four-pastel Tile tint
  set, the `#0e7490` Who's-Going admin accent, and the photo-hero sport label.
- **Courts** (explorer, detail, map): detail's supported sports → `SportChip`s; filter chips,
  segmented control, badges, and the Mapbox marker + popup HTML strings on tokens (CSS variables
  resolve in-document); the error state's two different reds normalised onto `danger`. One warm
  notice box stays bespoke.
- **Teams**: the hub's **duplicate local sport-colour map is deleted** — the card sport dot now
  renders `SportDot` (single source of truth), fixing beach volleyball showing the old
  brand-colliding orange there. Disbanded badge → exact `danger` tokens; role chips → `bg`. The
  generated per-team kit system and the sport-glyph watermark are untouched by design.
- The scoped tournament `.tp` theme was not touched, per policy. Lint + build green throughout.

### 2026-07-07 — Phase 4 (profiles & social-graph adoption) — complete
- **`PlayerCard` primitive** (`components/player-card.tsx`) — the collectible player sport-card:
  sport-accent strip + avatar ring, verified badge, geographic rank in the sport's colour,
  reliability, one-line context chip, compact `action` + full-width `footerAction` slots, and a
  stretched-link pattern so action buttons don't nest inside the card's anchor.
- **Adoption so far:** People You May Know renders `PlayerCard`; the network rows, `/discover`,
  and the rankings board have taken the design system (sport `SportDot`, and the semantic /
  brand / neutral tokens) into their existing dense or specialised layouts — the correct read of
  "one identity system, appropriate per surface" rather than one component forced everywhere.
- **Sport colours reconciled (important).** The Phase-2 sport tokens were replaced with the app's
  *established* accents that the `/me` page already used — tennis lime `#84cc16`, pickleball gold
  `#eab308`, padel blue `#3b82f6`, racquetball violet `#8b5cf6`. Beach volleyball keeps teal
  `#0d9aa6` because its established orange (`#f97316`) collided with the brand. There is now one
  sport-colour system across the tokens, `SportChip`/`SportDot`, and `/me`'s local map.
- **Both profile headers adopted:** `/me` and `/profile/[id]` primary sport → `SportChip`; their
  status / verification badges, sport-level grid, and empty states → tokens.
- **Profile-header consistency by primitives, not a shared component.** `/me` (self-view, edit
  affordances) and `/profile/[id]` (public-view, relationship buttons) serve different purposes, so
  they stay separate pages sharing the *design language* (`SportChip`, tokens) rather than being
  collapsed into one component — which would need heavy conditional logic for a modest DRY gain. This
  resolves the audit's divergence concern without over-engineering.
- **QA:** every adopted surface is free of arbitrary `bg-[#…]` colour classes; PYMK and the network
  rows are fully hex-free; the hex that remains is intentional (discover's dark hero gradient, the
  rankings podium SVG, the `KIND_DOT` / invite-tone bespoke colour sets, and gold accents). Lint +
  build green throughout.
- **Optional refinements (not blockers):** retiring `/me`'s token-mirrored `SPORT_COLOR` map for a
  single source of truth, and rendering the invites sport label via `SportDot`.

### 2026-07-07 — Phase 3 (navigation, shell & responsive) — complete
- **Mobile chrome consistency:** the mobile top bar now matches the bottom nav —
  both frosted glass (`bg-white/80 backdrop-blur-xl backdrop-saturate-150`,
  `border-rule/70`), so content scrolls under matching translucent bars top and bottom.
- **`--bottom-nav-h` token** (app/globals.css) is now the single source of truth for
  the fixed bottom-nav height. The nav spacer and the floating support widget (which
  sits `+0.5rem` above it) both derive from it, so changing the bar height can never
  again leave the widget overlapping the nav. Pixels unchanged.
- **Active-nav color is per-surface and unified within each surface:** the desktop rail
  uses `text-rail-active` (a lighter orange tuned for its dark Tideline background) for
  both an active item's icon *and* label; the mobile bottom nav uses `text-brand-deep`
  (for light). Inactive rail icons now brighten with their labels on hover. Contrast-driven
  — deliberate, not an inconsistency.
- **Footer widths** aligned to the `max-w-page` token (the authed footer was already 80rem;
  the landing footer widened 8rem to the site standard) — closes the audit's footer finding.
- **Rail IA is intentional, not consolidated.** The ~16 grouped destinations are the
  deliberate Facebook-style left rail Gabriel directed (Liquid Glass + a moving active
  highlight); Phase 3 refines *within* it. The Phase 1 audit's "consolidate the rail" note
  is retracted.
- **Tablet: the rail stays at `md` (≥768px).** Flipping it to `lg` is a known regression
  (June 2026 — it hid the nav at common widths and had to be reverted). The rem-based rail
  scales with the fluid root font and is narrowed to `w-60` below `lg` (full `w-64` at
  ≥1024px) for extra content room on tablets and small laptops.
- Phase 3 (navigation, shell, responsive) complete — lint + build green throughout.

### 2026-07-06 — Tournament public page · support system · social graph · teams terminology
- **Tournament public page (`/e/[code]`):** full redesign to the warm kraft
  editorial theme (see new §8) — dark photographic hero with glass info cards +
  countdown, sticky section nav, two-column body with sticky registration sidebar
  (capacity bar, weather card + WeatherComingSoon, venue map, premium sponsor),
  medal-gradient prizes, "powered by Klimr" footer. Lesson reinforced: replicate a
  provided design **fully in one pass** — a staged partial pass was rejected.
- **Help center (`/help`):** search-first pattern — dark hero with brand glows,
  **sticky search bar**, popular-question chips (deflection), tinted category card
  grid, per-topic accordions, "Still stuck?" band. Content single-sourced from
  `lib/help-content.ts` (also the AI assistant's knowledge base).
- **Support widget:** floating "Ask Klimr" launcher above the mobile bottom nav
  (`bottom-[calc(5.75rem+env(safe-area-inset-bottom))]`, `md:bottom-6`); panel with
  ink header, suggestion chips, typing dots, escalated banner.
- **Social UX:** optimistic relationship buttons with rollback + inline reasons;
  relationship-context chips on profiles; People-You-May-Know rail (cards with
  one-line "why", optimistic Connect, session dismiss). Blocked-pair invisibility
  everywhere (see §9).
- **Teams:** recreational teams show **Team structure** (Team manager / Player) —
  the four-role club grid is Pro-only; leave/transfer copy matches the category.
- **Admin:** Support queue added to the admin nav (status filters, urgency badges,
  ticket detail with AI transcript + private notes).

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
