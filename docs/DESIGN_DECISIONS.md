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

### 2026-07-10 — Security tooling decision (Dependabot yes, the rest no) + CI gates
- **Audit finding first:** no `.env*` files exist in the container or any shipped zip — keys
  live only in Vercel (correct posture); `.gitignore` gained `.env*` belt-and-suspenders.
- **Adopted:** `.github/dependabot.yml` (npm security PRs immediately, weekly grouped version
  bumps) + `.github/workflows/ci.yml` — the standing lint+build gates as a GitHub Action on
  every push/PR, which is what validates Dependabot's PRs before merge.
- **Rejected with reasons:** Docker Scout (Klimr ships no containers — Vercel + managed
  Supabase), Brakeman (Ruby-on-Rails-only static analyzer; wrong stack), SonarCloud (paid for
  private repos, noisy for a solo founder; the CI gates + Dependabot + optional Semgrep later
  cover the same ground at zero cost).
- **The real security surface** stays the app layer already under discipline: RLS + explicit
  GRANTs, owner/staff guards + guard-AND-hide (§10), scoped SECURITY DEFINER functions, rate
  limits, invite-code lockout + CAPTCHA, magic-link + TOTP, E2E chat, no payment handling,
  the data-governance ledger — scanners can't validate authorization logic.

### 2026-07-10 — Live regional feed BUILT (Phase 1 + social ranking) — migration 0111
- feed_items extended (actor/zip/lat-lng-ready/object refs/meta jsonb/dedupe unique/audience;
  existing composer rows backfilled to audience='global'); **seven SECURITY DEFINER trigger
  emitters** (profiles→player_joined incl. first-ZIP-set, queue_points won→match_result
  deduped per match, events→active, tournaments→public, listings→gear_listed,
  providers→pro_verified, teams→team_formed) + `feed_emit()` helper + 90-day regional prune
  cron; `lib/feed.ts publishFeedItem()` app seam; checklist §11 "Feed emission?".
- Feed page: ranked regional stream — 25 mi via lookupZip haversine over a 120-row window,
  affinity ×2.2 from accepted friendships with a visible **"Your circle" badge**
  (transparent ranking > black box), kind weights + 48 h half-life decay, global ops ×1.35,
  blocks filtered read-time, fresh actor-name hydration, player-group collapse cards,
  per-kind templates linking into the object (tournament /e/{code}, listing, pro overlay),
  Realtime **"New updates" pill** (never jank-inserts). Zipless viewers: global lane + ZIP
  prompt. Wire kicker now shows the viewer's city.

### 2026-07-10 — Feed architecture designed (docs/FEED-ARCHITECTURE.md)
- Recon: app/feed already composes next-match hero + events + feed_items; feed_items (0010)
  is the live curated ops channel (admin composer); 0006 posts layer dormant (P2 social lane).
- Decision: **one stream, three writer classes** — curated (exists), **automated DB triggers**
  on seven domain tables (SECURITY DEFINER, dedupe keys — emission in the DB per the scale
  mandate), and a lib/feed.ts app seam (checklist gains "Feed emission?"). Regional not
  follower-based ⇒ no per-viewer fan-out needed; 0111 extends feed_items with
  actor/zip/lat-lng/object refs/audience. Read = newest window + 25mi filter (bounding-box
  columns ready for the scale query). Live = Realtime INSERT → "New updates" pill. Ranking
  climbs via nightly rank_snapshots = Phase 2. Grounded in industry fan-out guidance.

### 2026-07-14 — Join-instead suggester · match-page energy · perf pass · house FilterChips
- **Before-you-create crosscheck**: as soon as sport (+ ZIP context) is chosen on /play/new,
  `findOpenMatches` (server action, debounced 400ms) surfaces ≤3 open matches nearby with
  free seats (same sport, ≤15 mi, upcoming/anytime, not yours, not already joined) in a
  warm non-blocking panel — when/court/distance/seats/organizer + one-tap **Join** (direct
  joinMatch, pending spinner). Creating below stays untouched.
- **Organize a match**: sport pills → a scalable auto-fill **tile grid** (emoji + name,
  tint/ring/lift selection, grows to any sport count); Create button wears the flame.
- **Performance pass** (docs/PERFORMANCE.md): the sluggishness was perceived-responsiveness
  — ZERO loading.tsx + missing pending states = silent navigations and the double-click
  symptom. Shipped: PageSkeleton + loading.tsx across nine segments (clicks paint within a
  frame), standing rules for pending states, both remaining <a> internals verified
  legitimate. Follow-ups: Vercel Speed Insights + web-vitals field data.
- **FilterChips = the sitewide-standard candidate** (Gabriel to approve): filters never wear
  the flame — selected = solid-ink + check (Material/Spotify grammar) so filters can't
  compete with CTAs; 32px single size, outline resting, mono counts, fixed label column
  (SPORT/TYPE/WHEN/PRICE/NEAR ME) for alignment, horizontal scroll (hidden scrollbar) on
  small screens instead of wrap-noise. Events browser swapped as the pilot; Link (`Chip`) and
  state (`ChipButton`) variants share one visual system.

### 2026-07-14 — Provider review console (0114) · definitive badge · no member DMs
- **Review console**: applications now show full identity (name · Member #NNNNN ·
  city, state · joined date · account UUID) from a richer profiles fetch; applicants can
  attach a credential document (PDF/JPG/PNG ≤5 MB) — **private** `credential-docs` bucket,
  owner-scoped storage policies, admins view via 10-minute service-role signed URLs;
  **Decision history** section lists approved/rejected applications with status pill,
  reviewer name (reviewed_by — the code already wrote it; 0114 supplies the column), date,
  and the review note — every admin sees every decision.
- **Badge, definitively**: the gradient at 17px was the "cheap" read. New CountBadge = the
  FB/iOS spec — flat solid #E7350F perfect circle, 18px, white 11px semibold grid-centered
  digits (no baseline hacks), pill only past one digit, ring where floating. Top-bar badges
  now float over the ICON (relative wrapper, -top-1.5/-right-2) instead of trailing the
  label; mobile bell + bottom-nav share the exact geometry.
- **No free-form member DMs**: Message removed from the profile ··· menu, the
  `messageMember` action and its notice banner deleted. The DM primitive itself stays —
  Training Room "Message {pro}" is its only entry, per product intent.

### 2026-07-13 — Public player profile rebuilt to the Daylight handoff (+ /settings/profile-page)
- **Kept the machinery, rebuilt the skin**: the existing page already ran the geographic
  ladder (`ranked_players` RPC, ZIP→World), honest badges, full safety state (blocks both
  directions w/ cloaking, reports, friendship, follows), relationship_context +
  mutual_connections. All preserved verbatim inside the new hero/stat-band/scope-strip layout.
- **New panels, all real data**: form dots + recent matches + head-to-head sourced from
  queue_points (the authoritative won ledger; scores parsed defensively from matches.result,
  omitted when absent); teams (team_members+teams w/ role chips); tournaments (live entries,
  pulsing IN BRACKET when in_progress); courts derived from actual recent match venues (≤3,
  distance vs the viewer's ZIP); gear bag + usual times + gallery from 0113 columns. **Every
  optional panel hides when empty; courts/teams/tournaments additionally obey the owner's
  privacy toggles.**
- **Config mandate delivered**: migration **0113** (gear jsonb, usual_times, profile_gallery,
  show_courts/show_teams/show_tournaments) + **/settings/profile-page** (privacy toggles,
  gear editor ≤8 rows, usual times) + settings-index row + "Edit profile" routes there.
- **Actions per the design**: Challenge = flame primary → /play/new; Connect/Follow reuse
  RelationshipButtons; **Block/Report live only in the ··· menu** (with Message via the 0110
  DM primitive and Share-link); BackPill is history-aware (router.back, /players fallback) so
  Network/Players/feed entries all return correctly.
- **Follow-ups**: owner gallery editor (column ships, mgmt is its own task per handoff);
  /play/new opponent-prefill param; World scope hidden-by-data until international.

### 2026-07-13 — Notification badge: live-clearing + the house CountBadge
- **Staleness fixed at both ends**: (a) visiting /notifications now auto-marks everything
  read (visiting IS reading; the redundant "Mark all read" button removed); (b) the bubble is
  a client `NotificationBadge` — layouts never re-render on navigation, so it refetches on
  route change + window focus and subscribes to the user's notification INSERT/UPDATEs,
  clearing the instant reads land (and ticking up live on new ones).
- **One visual system**: shared `CountBadge` — 17px pill, flame gradient, white tabular-nums
  bold 10px, `pb-px` optical centering (the old baseline sag), soft flame shadow, `ring-2`
  where it overlaps icons. Swapped at all four sites: top-bar Notifications (live) + Chats,
  mobile top-bar bell (live), bottom-nav Chats. Chats-count liveness = follow-up (same
  pattern over conversation_reads).

### 2026-07-13 — Archive retired: history lives in each section
- Gabriel's call: the combined /archive misled ("View past events" landed on a three-tab
  account page). Split into **/events/past** (30-day window — events are a pulse),
  **/tournaments/past** and **/classes/past** (full history — results and records stay
  reachable), each with its section back-link, History kicker, and the shared `HistoryList`.
  The three "View past …" links repointed; /archive now redirects tab-aware so old links
  never break.

### 2026-07-13 — Tournaments listing cards show the gallery lead photo
- Bug: cards fell back to the sport gradient because they read the legacy `cover_path`
  column while photos live in `format_config.gallery` (the /e hero's source). Fix: all three
  card surfaces (near-you, Organizing, Your entries) now derive
  `leadPhoto(format_config) → gallery[0]` — same source as the public page — **including the
  saved crop** (background-position from x/y, background-size from zoom, ≥100%), falling back
  to cover_path, then the gradient. Queries extended to carry format_config.

### 2026-07-13 — Feed Phase 2 BUILT (migration 0112): ranking moves, circle lane, 0006 revival
- **Ranking-move cards**: `rank_snapshots` (per-sport ranks over summed queue points) written
  nightly by `klimr-rank-snapshots` cron; the diff vs the previous snapshot emits
  `ranking_move` (climb ≥5 places into the top 200, region-scoped by the climber's ZIP,
  deduped per user·sport·day; snapshots roll at 14 days). Card: "#18 → #9 · up 9 places."
- **Circle lane**: `/feed?lane=circle` — connections' activity at any distance
  (fan-out-on-read over the friendship graph, `feed_items(actor_id)` indexed). Tabs (Nearby ·
  Your circle) at the wire header; circle-specific empty state.
- **0006 social revival**: member posts (auto-approved — invite-only community; the trigger
  honors the full moderation lifecycle: emit on approved, retract on rejection/delete) flow
  into the wire as Community cards with the composer atop the feed (500 chars, optional sport
  tag) and **likes** (optimistic heart, batched counts, author notified with a 60-min guard,
  never self). Delete-own with inline confirm; grants hardened on the 0006 tables. Comments
  remain deferred — a threaded content product deserving its own design turn. Write-time
  aggregation stays volume-gated per the architecture doc (read-time collapse already serves).

### 2026-07-13 — Live feed Phase 1 BUILT (migration 0111)
- Everything in FEED-ARCHITECTURE.md P1 shipped: **0111_live_feed.sql** (columns + indexes +
  audience backfill for legacy curated rows + `feed_emit()` dedupe helper + seven SECURITY
  DEFINER emitters: profiles/home_zip, queue_points wins, events→active, tournaments→public,
  listings, providers→approved, teams + 90-day prune cron `klimr-feed-prune`), `lib/feed.ts`
  seam, checklist feed-emission line, and the feed page read model: 120-item fetch → block
  filter → 25-mi radius via lookupZip → **recency half-life decay × kind weight × 2.2
  connection-circle boost** scoring → top 40 → fresh actor-name hydration (names never stored)
  → same-city 24h player collapse → per-kind cards; `FeedLivePill` subscribes to INSERTs and
  offers refresh (banner-not-jank).

### 2026-07-13 — Feed architecture designed (docs/FEED-ARCHITECTURE.md)
- Recon: feed_items (0010) already live with ONE writer — the admin composer = the ops-comms
  channel; the page also renders next-match hero + 3 upcoming events; 0006 social schema dormant.
- Design: **one append-only stream, three writer classes** (curated · SECURITY DEFINER trigger
  emitters on profiles/queue_points/events/tournaments/listings/providers/teams · lib/feed.ts
  app seam). Region-scoped broadcast means one row serves the whole audience — push-model read
  speed at single-write cost; no follower fan-out problem by construction. 0111 drafted:
  actor/zip/lat/lng/object/dedupe_key/audience + indexes (audience leads reads → leads indexes;
  denormalized rows so reads never join; idempotent emitters). Live pill (banner-not-jank,
  the pattern feed products converge on), 25-mi JS radius v1 → bounding-box SQL later (columns
  ship now), 24h client collapse, 90-day region retention, ranking climbs = P2 via
  rank_snapshots + nightly diff. Checklist gains a feed-emission line when P1 builds.

### 2026-07-10 — Health directory facets: chips → the marketplace rail pattern
- Gabriel rejected the specialty pill row (wraps into noise as specialties grow). Replaced
  with the house facet pattern from Second Serve: a **left rail** (`210px`, sticky) with two
  labeled groups — **Specialty** (identity-color dot + label + right-aligned mono count,
  active = tint-brand row) and **Format** (with per-format counts against the other active
  facets) — beside the results column. Scales vertically to any number of specialties.
  **Mobile**: the rail becomes two native selects (specialty w/ counts, format) above the
  results. ProControls slimmed to search + sort. All state stays in URL params; the bounded
  well is unchanged.

### 2026-07-10 — The Training Room: Health & Nutrition rebuilt to the scoped handoff
- **Scope held**: only /health (page + read/[slug] + review-policy), health-only components,
  lib/health-content.ts, the new /messages DM primitive, and migration 0110 + types. Side nav,
  top bar, globals, layouts, classes page, and the shared ProviderCard untouched.
- **Directory** (URL-searchParams throughout — filters/search/sort/topic/page/?pro all
  shareable): format segmented × specialty chips with live counts (5 identity palettes) ×
  debounced search × 4 sorts (top-rated w/ review-count tiebreak; nearest = in-person-alpha,
  virtual last — live distance is a geo follow-up). Cards in the **bounded well** (540px,
  internal scroll, overscroll-contain) so page height never grows; virtualization documented
  as the >100-pros follow-up. **Pro profile overlay via ?pro=** — identity, VERIFIED
  CREDENTIALS from approved applications (registry + ID + verify date — real data from
  0078/0109), member reviews (existing system, real names; verified-client gating is
  booking-era), sessions rail (price/availability/format from 0110 fields; Settings editor is
  the named follow-up), safety line, Report → support seam ticket. Both empty states incl.
  the striped zero-pros launch card.
- **"Message {pro}" is real**: no DM primitive existed, so 0110 adds one on the existing E2E
  infra — conversations.peer_id + canonical-pair unique index + is_dm_participant policies
  (0103's additive pattern), a slim text-only DmRoom (transplanted bootstrap/wrap/realtime),
  /messages/[id], and notifyDmMessage with the standard 90s/15-min guards. Courtside-tab
  surfacing = follow-up (chats page out of scope).
- **The Training Table at scale**: taxonomy as data (7 topics), 9 sourced reads
  (dek/topic/sources/reviewedAt; reviewer machinery live, names never fabricated — rows show
  cited bodies until a real reviewer signs), featured Tournament Week collection with the
  mini-ascent SVG, topic hub tiles with live counts, the index panel (search × topic × sort ×
  Load-more, tag column width derived from LONGEST_TOPIC_CH — never hardcoded), article pages
  with **real read tracking** (health_article_reads + SECURITY DEFINER bump RPC), Courtside
  questions accordion linking sources + directory, full disclaimer + linked
  **/health/review-policy** page.
### 2026-07-10 — Printable payments statement + credential verification & expiry system
- **Print statement** (payments page → /payments/statement): a print-optimized full statement
  — event header + generated timestamp, the six totals, the per-division ledger, and the
  complete per-entry table (name · division · entry status · payment · expected · paid) with
  the honest never-processes-payments footnote. PDF via the browser's Print → Save as PDF
  (`PrintButton`, zero dependencies — the bank-statement pattern). App chrome (rail, top bar,
  organizer header) gained `print:hidden`, so ANY page now prints clean.
- **Credential verification playbook** (researched at the sources): every role in the
  taxonomy now carries `verifyUrl` + `verifyNote` + `renewalNote` — CA DCA License Search
  (primary source, real-time, disciplinary actions) for PT, BOC's public registry (defined
  Certified/Expired/Suspended statuses) for ATC, CDR's verification system for RD/RDN, CAMTC
  lookup, AASP Find-a-CMPC, and **USREPS** (130k+ pros, one registry covering
  ACE/ACSM/NSCA-family certs) for trainer/group-fitness/CSCS, with NSCA's written form as
  fallback. The admin review card shows the playbook (official link + steps + renewal cycle)
  with a warning that applicant-provided links are context only.
- **Expiry-conditioned approval** (migration **0109**): the approve form takes the expiration
  from the document/registry; `class_providers.credential_expires_at` stores the **earliest**
  across a pro's roles. Directories (/health, /classes) filter expired pros out automatically
  (status preserved — resubmission restores without identity re-review); Settings →
  Professional shows the date with amber ≤90d / red expired banners; a daily pg_cron job sends
  the **90-day resubmit notice and a 14-day final warning** (deduped, set-based).

### 2026-07-10 — Health & Nutrition section + provider reviews (shared with Classes & Coaching)
- **New /health page** (rail + mobile menu + search-indexed): credential-verified
  health-category professionals (the taxonomy already anticipated it — ATC, PT/DPT, RD/RDN;
  added **Sports Massage (CAMTC)** and **Mental Performance (CMPC/AASP)** with honest CA legal
  notes) rendered through a shared `ProviderCard`, plus **The Training Table** — six original
  evergreen articles (`lib/health-content.ts`, expandable cards) with a clear
  educational-not-medical disclaimer. "Offer your services" routes to the existing
  professional-status application; the same admin credential review pipeline serves both
  categories. Competitor grounding: incumbents (Mindbody model) win on marketplace/discovery
  and community; Klimr deliberately skips their booking/payment complexity — direct
  arrangements + verified credentials + member reviews are the trust layer.
- **Uber-style reviews on providers** (migration **0108**): `provider_reviews` — one per
  member per provider (DB-unique), 1–5 stars + optional text, editable/removable, **no
  self-reviews** (action + RLS), real names only. Aggregates (`rating_avg`/`rating_count`)
  live on `class_providers`, maintained by a **SECURITY DEFINER trigger** (scale principle —
  never per-request scans). New-review notification to the pro (first post only, not edits).
  The same panel + card retrofit onto **/classes** as a "Verified coaches & trainers"
  directory, so both marketplaces share one review system. Sorting: rating → volume → name.

### 2026-07-10 — Payments accounting, refund status, occupancy audit, guard-AND-hide principle
- **Occupancy audit (Gabriel's rule restated & verified):** under_review holds its spot and
  counts toward capacity; only cancelled/withdrawn/disqualified free it. The prior sweep was
  correct in the workspace; the audit caught **two public-page stragglers** on /e (capacity
  count + signup-full exclusion) — both now exclude cancelled+disqualified.
- **Payments = the accounting one-stop shop:** the page now includes closed entries and opens
  with a **Fee accounting receipt** — six totals (Expected-live, Collected, Outstanding,
  Kept-forfeits, To-refund, Refunded) + a per-division ledger table with a totals row and a
  waitlist-not-billed note. Expected = division fee (per-player × rostered players); Collected
  uses the recorded paid amount when present. Derivations: cancelled/disqualified + confirmed
  = **forfeited (kept)**; withdrawn + confirmed = **to refund** until marked; new
  payment_status **`refunded`** (migration 0107, dynamic check rebuild) recorded via a
  staff-level `markPaymentRefunded` (notifies the entrant) with a **Mark refunded** button on
  confirmed rows; closed entries get status badges ("Cancelled · fee forfeited").
- **Guard AND hide (sitewide principle, checklist §10):** every capability needs the server
  guard AND a conditional render — controls a viewer can't use must not exist in their UI.
  Audit result: danger zone was already owner-gated; moderation + division select gated last
  round; payments intentionally staff-level. The principle is now encoded for every future
  feature.

### 2026-07-10 — Entry moderation (organizer-only): cancel ±penalty, disqualify, under review, reinstate
- **Owner-only by construction**: every action rides `ownedReg` (checks `owner_id === user.id`
  — managers/staff are rejected server-side) and the UI controls render only for `isOwner`.
- **Status semantics**: cancel-no-penalty → `withdrawn`; cancel-with-penalty → `cancelled`
  (fee-forfeited messaging — Klimr never holds money, the forfeit is recorded & communicated);
  `disqualified`; `under_review` **holds its spot** (they may fix it) with a REQUIRED
  organizer note the player sees ("Action needed: …"); `reinstate` returns to pending,
  **capacity-checked** when coming back from a freed state. Occupancy swept sitewide:
  `under_review` added to every occupying set (reconciler, saveDivisions live-check, settings
  liveContext, move-full check) and `capacityBlock`'s exclusion extended to
  `(withdrawn,declined,cancelled,disqualified)` at 10 sites — cancelled/DQ free spots for
  signups, under_review doesn't. Reconciliation fires only when occupancy actually flips
  (pending/confirmed ↔ under_review skips it). Migration **0106**: `moderation_note` +
  status-check rebuilt with the full set.
- **Registrations page**: badges for the new statuses (amber review, red cancel/DQ), the
  fix-note shown on the row, and a collapsed **Closed entries** section (withdrawn/cancelled/
  disqualified) where Reinstate lives. Every affected player is notified with honest copy per
  action.

### 2026-07-10 — Division reassignment (the deletion escape hatch) + Courtside display on phones
- **Entries can live outside a division** (Gabriel's design; `division_id` was already nullable
  and the reconciler already skips unassigned rows). New `moveRegistrationDivision` (staff-
  guarded via ownedReg): assign / switch / **unassign** any entry from the Registrations page —
  each row gains a division selector with fee-labeled options ("Competitive — $50/player") plus
  "No division (unassigned)". Moving IN is blocked when the target is full (numbers in the
  error); moving OUT frees a spot and the reconciler **automatically promotes that division's
  waitlist head**; any cross-division move under a built schedule resets it (groups reshaped);
  the registrant is notified either way. Division deletion's block message now points here.
  Fees are NOT auto-recalculated on moves — the fee-labeled options make deltas visible.
- **Courtside display adapts by orientation + size** (pure CSS, automatic): the versus panels
  go `grid-cols-1` on phone-portrait, `landscape:grid-cols-2`, `md:` keeps iPad identical in
  both orientations; the next-up strip stacks the same way; all vw paddings gained `max()`
  floors so phones never collapse to slivers; team-name areas scroll if they overflow. No JS
  detection — `portrait:`/`landscape:` variants do it natively.

### 2026-07-10 — Reconciler made state-aware (Gabriel's differentiation principle)
- Empty cases were already no-ops by construction (no regs → empty buckets → nobody moved;
  no built schedule → no reset; cautions hidden). Two mechanically-dumb behaviors fixed:
  **value-based change detection** — sections resend their whole slice on every save, so both
  save paths now compare against current values (re-saving identical settings is a pure no-op;
  a divisions save that only edits names/descriptions/fees skips reconciliation entirely);
  and **composition-triggered schedule reset** — a built schedule now resets only when the
  group SHAPE changed (format, pools, mode, unit, roster, entry type, division set/caps) or
  when the reconciliation actually moved someone; a pure cap raise that promotes nobody leaves
  a valid bracket standing. Bonus: resetting a schedule on an event with zero entrants clears
  silently (the save flash reports it) instead of ringing the organizer's bell.

### 2026-07-10 — Capacity-change reconciliation algorithm + mobile workspace fixes
- **The invariant machine** (`reconcileTournamentStructure`, run after every capacity/format/
  divisions save): buckets = one pool (pooled) or one per division; caps convert to ENTRIES
  (person-unit ÷ `roster_size` for team events). Per bucket: **never drop anyone** — over-cap
  actives demote newest-first to the waitlist (earliest sign-ups keep spots) with a
  notification; freed capacity promotes the waitlist head (also on cap removal); waitlist
  positions renumber per bucket by sign-up time. If structural rules changed (mode, unit,
  roster, format, pool count, entry type, division caps/set) while a schedule was built or
  published, the published pools/bracket/schedule are cleared and the organizer is notified to
  rebuild. **Division deletion with live entries is blocked** (prevention beats data surgery).
  Save flashes report the outcome ("Saved · 4 moved to waitlist · schedule reset", 8s), and
  amber caution lines appear on the capacity block and divisions section whenever live entries
  or a built schedule exist. Null-division entries under per_division mode are left untouched
  (uncheckable) by design.
- **Mobile menu:** the sheet's scroll area now pads past the bottom nav + safe inset, so Log
  out rests above the bar instead of behind it.
- **Tournament workspace on phones:** organizer strip and settings section strip already
  scrolled; the page-zoom squeeze is contained at the boundary — the workspace `<main>` gained
  `min-w-0 overflow-x-clip`, so no rogue-width child can widen the layout viewport again.

### 2026-07-09 — Contour corrected to Gabriel's actual spec: two layers
- Requirement clarified: **original strength on the open canvas, whisper inside cards.** One
  overlay can't hold two opacities, so the contour is now two copies of the same SVG
  (`ContourLayer`): a **base at 2.5% with `z-index:-1`** — painting above body's background but
  below all in-flow content per CSS painting order, so opaque cards mask it entirely — plus the
  existing **top layer at 2%** floating above everything. Canvas sums to ≈4% (Gabriel tuned it down from the original 4.5%);
  cards see only the 2% top layer. Verified prerequisite: the page background lives on `body`
  and the app wrapper is transparent.

### 2026-07-09 — Identity & compliance round: durable user IDs, buy flow, maps link priority
- **User identification (researched, CCPA-grounded):** users already carry the immutable UUID;
  0105 adds **`member_no`** (short human-readable, sequence-assigned, never reused) and the
  **`deleted_users_ledger`** — the service-role-only record written at purge time (both the
  nightly `purge_archived_accounts()` and admin purge) holding UUID, member #, name, email,
  dates. Logs keep their UUID after purge (error_logs FK dropped → pseudonymous, the Facebook
  model), with the ledger as the sole controlled re-association path under CCPA §1798.105(d)
  security/fraud/debug exemptions + §7022 record-of-deletion. Admin diagnostics now display
  `Name · #10023` (and `(deleted) · #` via the ledger). Full policy: **docs/DATA-GOVERNANCE.md**
  (lifecycle, retention table, request handling, commitments).
- **Buy at asking:** `buyNow` opens the thread and places a full-price offer through the
  existing machinery (accept ⇒ pending; the listing stays visible until the seller marks sold).
  Detail: Buy = gradient primary on sale+active, Message seller demotes to bordered; room gains
  a "Buy at $X" chip. **Message-seller silence fixed loud:** guards now redirect with visible
  notices; listings without a seller account (null `listed_by` seeds) say so and hide contact.
- **Maps link priority everywhere:** tournament public page now resolves `location_url` to the
  exact point (short links included); the HTML scanner gained Google's
  APP_INITIALIZATION_STATE / latitude-longitude shapes; the event form resolves short links
  **live via a server action** with honest captions (exact pin / resolving… / "open the short
  link and paste the full URL" guidance) — relevant since Google sunset goo.gl.
- Contour overlay 0.03 → **0.02**.

### 2026-07-09 — Marketplace wayfinding labels + contour softened
- Back links on marketplace detail / new / mine now read **Marketplace** (the rail's name) —
  "Second Serve" stays as the browse page's brand H1/kicker, but wayfinding matches navigation.
- The desktop contour SVG is a fixed overlay that paints **above** content (cards were never
  translucent); its opacity went 0.045 → **0.03** so the lines keep texturing the canvas while
  only whispering through white containers sitewide.

### 2026-07-09 — Tournament public page: rotating hero (≤10 photos, crop) + status-toned CTA
- **Hero one-third taller** (padding scale on /e/[code]) and now a **crossfading carousel**:
  up to 10 photos, 10-second rotation, clickable dots (dot click restarts the timer), each photo
  honoring its crop. **Zero migration** — items live in `format_config.gallery`, upgraded from
  plain URL strings to `{ url, zoom, x, y }` with `normalizeGallery()` accepting both shapes
  (legacy strings render at default framing).
- **Non-destructive crop**: zoom (1–2.5×) + focal point stored as CSS params
  (object-position + scale at the same origin). The organizer's crop preview uses the exact
  hero CSS, so the editor is WYSIWYG; originals are never re-encoded.
- **GalleryEditor rebuilt**: cap 10, drag-to-reorder (first photo leads), per-photo crop panel
  (drag-to-frame with pointer capture, zoom slider, reset), explicit **Save layout** with the
  3-second Saved flash and dirty tracking. `commitGalleryPhoto`/`removeGalleryPhoto` made
  object-safe (the old `.map(String)` would have corrupted object items) and a guarded
  `setGalleryLayout` persists order+crops, rejecting foreign URLs.
- **Status-toned action**: the sign-up button, hero "Registration open" pill, capacity bar, and
  waitlist trigger all take the notice's tone — green open, amber closing-soon/almost-full,
  red-clay sold-out waitlist; closed/not-yet stay the neutral disabled button.
  `JoinWaitlistDialog` gained a `triggerStyle` prop.

### 2026-07-09 — Five-fix round: event geo chain, form map preview, solid top bar, tournament capacity UX, Saved flashes
- **Events distance/map fixed at the root:** an event's coordinate now derives from a chain —
  linked court → the organizer's pasted **Google Maps link** (`parseLatLngFromMapsUrl`, no
  network) → the **venue text geocoded** against the local US dataset (ZIP in the text, else
  city match, so "Santa Monica, CA" pins at the city centroid). Gabriel's Santa Monica event now
  appears inside the 25-mile radius and pins on the browse map; the empty-map note names all
  three sources.
- **Create/edit form gains a live map preview** under the Google Maps link field: exact pin when
  the link parses, venue-text fallback otherwise, with an honest caption saying which it is.
- **Top bar is now a solid lane (permanent):** the desktop wrapper carries the paper background
  and the pill went opaque (`#FFFDF8`, blur dropped — matching the mobile bars). Content can no
  longer show through behind the bar, which kills the restored-scroll-on-back illusion of the
  bar "covering" page tops. Chosen over scroll hacks: simplest, consistent, faster.
- **Tournament capacity UX:** the per-division note now says "in the Divisions &amp; fees
  **section below**" and links to it. Division cards reorganized into two labeled sub-panels —
  **Entry fee** (amount + charged-per toggle + preview) and **Division capacity** (count + a
  **unit chip** that reads teams/players from the saved Format &amp; eligibility unit, threaded
  from the page; save → `router.refresh()` keeps it in sync after unit changes).
- **"Saved" flashes are now transient sitewide:** 3-second auto-clear (presence-control
  precedent) + clear-on-interaction. SectionCard and VisibilityRow got timeout refs with unmount
  cleanup plus `onInput`/`onClickCapture` clears on their content; the divisions editor clears
  its `Saved {time}` on any row edit/add/remove; match-plan rows got the timeout (they already
  cleared on change).

### 2026-07-09 — Sitewide notification audit + the Feature Integration Checklist
- **Audit result:** matches, network (social graph), teams, tournaments, classes, team chat,
  support, and marketplace were already flowing through the seam (`lib/notify.ts`, zero direct
  inserts anywhere). Gaps found and closed: **match-chat replies** (new guarded
  `notifyMatchThreadMessage` fan-out — same 90s-read / 15-min-ping guards as marketplace, wired
  into the room's send; team chat and marketplace already notified, so match chats were the odd
  one out), **event RSVPs → organizer** (going + approval-pending variants),
  **admin verification decisions → the user**, **provider-application decisions → the
  applicant**, and **report resolutions → the reporter** (actioned/dismissed).
- **Mobile-app readiness:** `lib/notify.ts` is now the documented delivery pipeline —
  `createNotification` writes the in-app row and calls `deliverPush` (a contracted no-op) so
  APNs/FCM/web-push attach at ONE function later, not via a codebase sweep. `Kind` exported.
- **Write-paths that don't exist yet** (kinds reserved, wiring noted in the checklist):
  sponsor-offer creation, challenge actions, ranking milestones, organizer event
  cancellation/edits.
- **The system Gabriel asked for:** `docs/FEATURE-INTEGRATION-CHECKLIST.md` — the per-feature
  evaluation walk (notifications, diagnostics+userMessage, support seam, realtime, the four
  nav/search surfaces, mobile pass, RLS+GRANTs, scale, US-gate, ship hygiene). Every future
  feature gets walked through it before shipping.

### 2026-07-09 — Marketplace notifications completed (Gabriel's audit)
- The offer/meetup events already notified; the audit closed four gaps. **Chat replies** now
  notify: messages are E2E (the server never sees content), so the room fires
  `notifyThreadMessage` after each successful send — privacy-correct ("New message — {title},
  from {name}", never the text) and double-guarded against spam (skipped when the recipient read
  the thread within 90s, or was already pinged for it within 15 min). **Closing a listing**
  (sold/unpublished) now expires every open offer and notifies each affected buyer, linked to
  their thread. **Reporters** get an acknowledgment. **Expiring-soon reminders** ship as
  migration **0104**: a set-based `notify_expiring_listings()` (≤3 days left, deduped over 4
  days) scheduled daily via pg_cron — defensively wrapped so the migration succeeds even where
  pg_cron isn't available.

### 2026-07-09 — Second Serve — Increment 3 of 3: the buyer handshake (chat, offers, meetups)
- **Migration 0103** (Gabriel runs): additive RLS for listing-scoped chat via a SECURITY DEFINER
  `is_listing_conv_participant()` — buyer + seller gain conversations/messages/conversation_keys
  access for their threads; match-chat policies untouched (policies OR-combine).
- **Message seller** (detail primary, gradient) get-or-creates the one thread per listing+buyer
  (`conversations.listing_id`, race-tolerant) and lands on **`/marketplace/messages/[id]`** — the
  new MarketplaceRoom: the match room's E2E machinery transplanted (identity upsert, wrap/unwrap,
  buyer bootstraps, device self-heal, realtime + 4s poll), with a listing header card, the
  always-visible safety line, and a **merged timeline**: encrypted messages + structured offer
  cards + meetup cards interleaved by time (D2 exactly as decided).
- **Offers**: make / accept / decline / counter (counter closes the parent, renders as
  "Countered") / withdraw; 7-day expiry surfaced lazily; **accept ⇒ listing goes pending**; one
  open offer per buyer (DB-enforced); sale-mode only. **Meetups**: propose a court (the seller's
  meet spots) or another public place + time, accept/decline/cancel, and an **ICS route** guards
  participants and serves the accepted plan as a calendar file. Notifications ride
  `createNotification` on every offer/meetup event, linking into the thread. Post-sold buyers get
  a one-tap encrypted "Confirm received" chip. Thread expiry: close ⇒ +30d, relist ⇒ revived
  (wired into `setListingStatus`).
- **Courtside split (D3)**: Matches | Marketplace tabs — marketplace rows show cover, title,
  Selling/Buying role chip, toned price, counterpart, activity, status; Live / Wound-down strips;
  the live-refresher now also subscribes to listing-thread ids. **Classes → "Classes & Coaching"**
  renamed across rail, mobile menu, search index, and the page itself.
- Second Serve is now feature-complete per the handoff + extension prompt across increments 1–3.

### 2026-07-09 — Second Serve — Increment 2 of 3: the seller write side
- **Migration 0102** (tiny, Gabriel runs): `meet_court_ids uuid[]` — up to three courts a seller
  suggests as safe exchange spots.
- **Create/edit wizard** (`/marketplace/new`, `/marketplace/[id]/edit`, shared `ListingForm`):
  photos 1–5 with native **drag-to-reorder** (cover = slot 1; order submitted as explicit
  `e:`/`n:` tokens so a new photo dragged to slot 1 truly becomes the cover), photoless allowed
  (tint fallback), mode segmented (Sell / Trade / Give away) with price+OBO or trade-wants,
  **pickup area = ZIP → neighborhood label** (US-gated like onboarding; exact address never
  exists), **suggested meet spots** picked from real courts within 15 mi of the ZIP (max 3),
  prohibited-items + venue-only terms, Publish or Save-as-draft. Server-side validation mirrors
  every client rule; photos upload under the owner's storage folder per the 0101 policies.
- **My listings** (`/marketplace/mine`): status tabs with counts (active/pending/sold/draft/
  expired — expiry computed lazily from `expires_at`), per-row publish / mark-sold / back-to-
  active / relist (fresh 30-day clock) / edit / unpublish / delete (soft `removed` + storage
  cleanup), days-left readout, gradient primaries only where §-grammar calls for them.
- **Anti-spam, server-enforced:** 20 live listings max, 5 creates/day.
- **§5 owner treatment corrected on detail:** Edit listing is the owner primary now that the
  route exists; Mark-as-sold demoted to ghost. Detail also shows the seller's suggested meet
  spots as court chips. Browse header gains a ghost "My listings" beside List gear.
- Next: Increment 3 — listing chat threads + interleaved offers + meetup step (ICS) + Courtside
  Matches | Marketplace split + the "Classes & Coaching" rename.

### 2026-07-09 — Second Serve (gear marketplace) — Increment 1 of 3: data layer + read side
- Gabriel approved the plan with decisions: **D1** gradient primary (handoff's solid `#FF4E1B`
  referenced a stale snapshot of + Match); **D2** offers as structured `listing_offers` rows
  rendered interleaved in the thread (E2E ciphertext can't drive server state); **D3** listing
  threads live 30 days past close and **marketplace chats are organized separately from match
  chats** (Courtside gets a Matches | Marketplace split; marketplace threads route under
  `/marketplace/messages/`); **D4** Classes → "Classes & Coaching". Meetup calendar-add ships as
  ICS; reports flow the `lib/support-events` seam (tickets, no new admin UI).
- **Migration 0101** (Gabriel runs): listing lifecycle model (mode/obo/trade_wants/photos/zip/
  renewed/expires/sold, status set draft→active→pending→sold/expired/removed, honest free-mode
  backfill), `listing_offers` (counter chains, 7-day expiry, one open per listing+buyer),
  `listing_meetups` (courts as safe spots), `listing_reports`, `conversations.listing_id` with
  per-buyer uniqueness, RLS **with explicit GRANTs** (the privileges lesson), and the public
  `listing-photos` bucket with owner-folder write policies.
- **Shipped this increment:** rewritten browse per handoff §2 (Second Serve header + gradient
  List gear, 264px sticky filter rail with live-count categories/sports and radius, saved chip +
  sorts with trades-last price ranking, 4:3 photo cards with badge priority yours>sold>pending>
  trade/free, optimistic hearts, URL-state, honest ZIP-centroid distances) and detail per §5
  (gallery with thumbnails, mono meta, toned price/OBO/TRADE-wants/FREE, chips, seller trust
  block → profile, owner lifecycle actions incl. relist renewing the 30-day clock, viewer Save,
  safety footer + Report→support ticket). Message-seller is deliberately absent until its thread
  exists (Increment 3) — no dead primaries. Old `controls.tsx` deleted (GitHub deletion required
  at next upload). Legacy coaching rows untouched and simply never rendered.
- **Next:** Increment 2 = create/edit wizard (photos, ZIP pickup area, court meet spots, terms) +
  My listings + anti-spam caps; Increment 3 = listing chat + offers + meetup + Courtside tabs +
  the Classes & Coaching rename.

### 2026-07-09 — Bottom-nav active pill rebuilt (single sliding pill, Material-3)
- Gabriel's screenshot showed the active highlight slicing through the label: **two stacked
  shapes** — the sliding indicator (36px, ending mid-label) plus per-element `bg-brand/[0.08]`
  boxes the Daylight sed had put on the icon *and* the label span. Rebuilt as one system: every
  tab has a fixed **56×30 icon slot**, and the single sliding pill is sized to exactly that slot
  (geometric identity — it cannot touch text). Labels/icons color only (`flame-text` /
  `brand-deep`); the Chats badge rides inside the slot with a bar-colored ring; the You avatar
  keeps its brand ring inside the pill.

### 2026-07-08 — Mobile overhaul (nav, performance, layout) — from Gabriel's iPhone walk-through
- **Navigation (the core failure):** the rail is desktop-only and the bottom bar holds five tabs,
  so most destinations (Tournaments included) were **unreachable on phones**, and search didn't
  index pages — a literal dead end. Now: a **Menu button in the mobile top bar** opens a
  full-screen grouped sheet (the Facebook pattern) with every destination as tap-friendly tiles —
  primary four, Compete/Community/Discover/Account groups, Admin, Log out — body-scroll-locked,
  auto-closing on navigation, solid surfaces. **Search now indexes pages** (client-side, instant):
  a `page` result kind with 22 destinations, so typing "Tournaments" navigates.
- **Performance:** `backdrop-blur` removed from both mobile bars (solid warm white — mobile WebKit
  compositing was the likely tap-lag culprit, the exact risk flagged in the iPad discussion) and
  the full-page contour SVG is now desktop-only. The fluid UI scale was already ≥768px-only.
- **Layout:** the five-across rank tiles wrap 3+2 on phones (the screenshots were the public
  profile — /me never had them); Calendar defaults to the **Day agenda on phones** and the month
  grid goes dots-only (times/titles from `sm:`), with tighter cells and a compact "+n".
- Bottom nav verified already `fixed` with a correct spacer (the screenshot gap was Safari
  rubber-banding). Deeper perf profiling (bundle/lazy audit) queued if lag persists after the blur
  removal ships.

### 2026-07-08 — Diagnostics: the exact user-facing message travels with every report
- Gabriel's call after correlating his on-screen error with its Diagnostics entry: admins should
  see **what the user saw**, verbatim. `reportClientError` gains an optional `userMessage`,
  composed into Details as a leading `User saw: “…”` line (text-format, **no schema change**).
  Wired everywhere a report pairs with on-screen copy: events geolocation (one const now feeds
  both the UI and the report — they can never drift), missing Mapbox token, chat secure-setup
  failure, and both error boundaries. Global window-listener reports carry no userMessage — those
  errors show the user nothing, and claiming otherwise would be false data. Server errors pair
  with their boundary report via the shared digest.

### 2026-07-08 — Geolocation was blocked sitewide by our own Permissions-Policy
- The proximity "permission denied" affected **every user**: the hardening header in
  `next.config.ts` shipped `geolocation=()` (empty allowlist), which disables the Geolocation API
  before the browser can even prompt. Correct when added (no feature used it); stale once the
  Events proximity filter shipped. Fixed to `geolocation=(self)`; camera/mic stay locked until
  identity verification needs them. Lesson recorded: **auditing response headers is part of adding
  any browser-API feature.** Validation note: the event was visible in Admin → Diagnostics as the
  `[client]` geolocation warn — the sitewide capture caught its first real bug.

### 2026-07-08 — Chat liveness end-to-end (list + thread)
- **The reported bug** (send a message, go back, the list still says "No messages yet" until a
  hard refresh) had two causes: Next serves back/forward navigations from the router-cache
  snapshot *by design*, and nothing subscribed to changes. The room, it turned out, wasn't
  realtime either — it polls every 4s.
- **Courtside list:** `force-dynamic` + a `ChatsLiveRefresher` (client, renders nothing) that
  calls `router.refresh()` — debounced — on mount (kills the back-nav snapshot), on tab
  focus/visibility, and on realtime events: a message INSERT in any of the user's conversations
  (theirs or the other player's) or the user joining a new match. Refresh re-runs the server
  component, so rows, grouping, expiry, counts, and the header pill all update together — the
  logic stays server-side, nothing is duplicated client-side.
- **Thread:** realtime INSERTs on the conversation now decrypt through the existing E2E path and
  append instantly (id-deduped against the poll); the 4s poll stays as the resilient fallback for
  dropped sockets or pre-migration environments.
- **Migration `0100_chat_realtime_publication.sql`** (Gabriel runs manually): idempotently adds
  `messages` + `match_participants` to the `supabase_realtime` publication — realtime is inert
  until this runs; the mount/focus refresh already fixes the reported repro without it.

### 2026-07-08 — Sitewide error capture + US-only signup gate
- **Every error now reaches Admin → Diagnostics** (Gabriel's directive after the geolocation
  message never surfaced there). The existing, well-built `recordClientError` action + `error_logs`
  table had exactly one caller; the missing plumbing is now in — **no migration needed**:
  `lib/client-diagnostics.ts` (flood-guarded wrapper: per-message 60s dedupe, 20/min ceiling),
  `ErrorReporter` in the root layout (window `error` + `unhandledrejection`, noise-filtered),
  branded `app/error.tsx` + `app/global-error.tsx` boundaries that self-report (with digests), and
  **`instrumentation.ts` `onRequestError`** — Next's global hook capturing every uncaught server
  component / action / route error. Manual telemetry wired at the known user-facing branches:
  events geolocation failures (the original case, level `warn` with the code), missing Mapbox
  token, and match-chat secure-setup failures. Prefixes `[client]` / `[server]` make sources
  visible in the existing Diagnostics filters.
- **US-only signup gate**: onboarding and settings both looked up `zip_regions` and silently
  accepted misses with null region + `country: "US"`. Both now require the ZIP to resolve — via
  `zip_regions` or the bundled US dataset (`lookupZip`) — and reject unknown/foreign codes with a
  professional note ("Klimr is currently available only in the United States…"). When
  `zip_regions` misses but the US dataset hits, city/state are filled from the dataset instead of
  saved as nulls. Future geo-IP checks noted as a later layer.

### 2026-07-08 — Events map corrected to the house stack (+ area search)
- **Correction, owned:** the previous round added Leaflet for the events map without checking the
  codebase — Klimr already ships **Mapbox GL** (courts map) and a **free offline US geocoder**
  (`lib/us-places`). The events map is rebuilt on Mapbox (same init/marker/popup pattern as
  CourtsMap; flame pins, "Open event →" popups, proximity ring as a GeoJSON layer, fit-to-bounds)
  and the **Leaflet packages are removed** — package.json/lock changed again (removal only).
  Requires the existing `NEXT_PUBLIC_MAPBOX_TOKEN` env (already set for courts).
- **Map always visible** under the filters whenever events exist (the old coords-required
  condition was why Gabriel saw no map); zero-pin state explains itself honestly and points to the
  area search.
- **City/ZIP area search** added to the NEAR ME row via a new server action on the local dataset
  (`resolveEventArea` — ZIP or city → centroid + label, zero external calls): sets the map center
  + proximity origin, defaults the radius to 25 mi, and labels the count line ("within 10 mi of
  Mar Vista, CA"). Works with location permission denied.
- **Geolocation errors differentiated** (was mislabeling timeouts as "permission denied"):
  code-1 vs other failures get accurate messages, both pointing to the typed-area fallback.

### 2026-07-08 — Sitewide anchor-scroll fix
- In-page anchor jumps were landing behind the sticky bars (seen on the Playbook section index;
  a long-standing class of bug). Fixed globally with `scroll-padding-top` on `html` (4.5rem
  mobile / 6rem under the desktop toolbar) — every current and future `#anchor` link and
  `scrollIntoView` call now lands below the chrome with the intended breathing room.

### 2026-07-08 — Walk-through feedback round 1 (8 items)
- **Events: map + proximity.** Courts carry real `lat`/`lng`, so events joined to a court now pin
  on an OpenStreetMap panel (Leaflet + react-leaflet — **new deps; deploy needs the updated
  package.json/lock**) under the filters: flame pins, popup → event page, fit-to-bounds. Proximity
  = real browser geolocation with 5/10/25-mi chips filtering the grid (haversine); honest notes
  for unmapped events and denied permission. Map hides when nothing is mappable.
- **Hover clip fixed** on "You play most with" (scroll row lacked top padding for the lift).
- **Chat thread redesigned** as a contained Daylight panel (max-w 880, self-sizing height with
  bottom-nav awareness, min/max clamps): header with sport-tone tile, paper message well, flame
  gradient own-bubbles, in-panel quick replies + flame send. No more viewport bleed; stable on
  every breakpoint. All realtime/encryption logic untouched.
- **Sponsorships rebuilt as a partner marketplace** (research: sponsorship platforms + club
  partner-page patterns — value-forward hero, categorized brand-forward partner walls, explicit
  perks, strong prospect CTA): computed footprint stats (sponsors/categories/neighborhoods — never
  invented), three why-sponsor props, category-toned type chips, rich brand cards finally using the
  real `tagline` + `perks[]`, flame-tint business CTA panel. Player offers/active flows preserved.
- **Playbook expanded** for all five sports: serving steps, faults, etiquette, first-match
  checklist, and glossary authored per sport (traditional pickleball scoring noted with the rally
  variant; padel golden point; racquetball 15/15/11 + server-only scoring; beach 21/21/15 with end
  switches); **labeled to-scale court diagrams** (new `CourtDiagram` — tennis boxes, the kitchen,
  padel glass, racquetball service zone + receiving line, sand court) on a rebuilt guide page with
  section index, numbered steps, tone-coded lists, and a rankings cross-sell.
- **Rail refined per Gabriel:** Chats removed (lives in the top bar); My profile moved to the
  footer slot; Invite friends moved into the user menu; accordion threshold retuned 1180→960px so
  it only compacts when ~two buttons of space remain.
- **Top bar:** Notifications label restored (ghost link with count badge); breathing room added
  before the Match CTA.

### 2026-07-08 — /me cover wash removed (owner call)
- The sport-accent gradient over the /me cover photo (added in V2, lightened in Daylight) is
  **removed at Gabriel's direction** — the cover now displays untinted. The sport-accent avatar
  ring stays. The public profile's hero *band* (no photo) still carries the light sport tint.

### 2026-07-08 — DAYLIGHT, Increment C (§4 recipe, central layer) — forms, CTAs, stat tiles
- **Form sweep (§4.6):** all 61 fields (keyed on the focus-halo signature, multi-line-safe) →
  radius 10, `rule-2` borders, flame focus ring retained; resting `shadow-e1` **stripped from
  fields** — resolving the long-flagged V1 side-effect per spec (fields carry no shadow).
- **One-flame reconciliation (§4.5/§6):** the V3 branded glow removed from **59 raw pills / 46
  files** (they stay solid-brand, quiet); the `Button` **primary variant is now the canonical
  flame CTA** — `linear-gradient(140deg,#FF6A35,#E23E0D)` + `shadow-flame` + brightness hover —
  and danger returns to quiet solid. Pages migrate toward literally one filled control as they
  get §4 composition passes; the primitive now encodes the target.
- **`Stat` → sunken tile (§4.4):** mono kicker label + Space Grotesk value on `--surface-sunken`
  with the `#EFE9DC` hairline, radius 12 — propagates to every Stat use (/me and friends).
- **play/new** gained the §2.3 grammar; **Mountain nodes** hide the place label on small screens
  (tier + count remain) so the five nodes breathe on phones.
- **Remaining §4 (incremental polish from here):** per-page one-panel list conversions (§4.3 —
  notifications, invites, network row groups), admin table treatment (§4.8), and per-view
  one-flame audits as surfaces are touched.

### 2026-07-08 — DAYLIGHT, Increment B (the six pages + grammar rollout) — spec §2.3–§3 complete
- **New primitives:** `page-header.tsx` (§2.3 `PageHeader` + `StatusPill`), `countdown.tsx`
  (real next-match countdown, HRS:MIN → NOW). Footer → §2.4 (mono © line + Contact). Bottom-nav
  active → Daylight pill.
- **§3.1 Home/Feed rebuilt:** greeting header (LA-aware daypart) + grass pill (real upcoming
  count); **live ticker** from real data (upcoming matches → UP NEXT, decided team matches with
  real scores → FINAL; no LIVE state exists in the schema, so none is faked); **next-match hero**
  only when the user has one (real opponent or honest "Open spot", real court, real countdown; the
  spec's weather is illustrative → omitted); the wire restyled (kind-colored mono kickers);
  sidebar: **Your altitude** (real ZIP standing via `ranked_players`, honest empty states),
  date-tile events, tint-flame Jump-in, reserved-stripes sponsor slot wrapping the real AdSlot.
- **§3.2 The Mountain:** header grammar + YOU pill (real band); flame-gradient sport pills; the
  **Mountain hero** (spec SVG ridges, sun halo, dotted route, flame flag) with **five scope nodes**
  wired to the existing scope state and real climber counts; contention rows, 84px standing
  numeral, sunken tiles, sun-toned nudge, How-points card. **The logo-stair podium is untouched,
  per Gabriel's directive** — the spec's medal-tile podium was not adopted.
- **§3.3 Match Lab:** the dark AI hero (a §6 violation) replaced by header grammar + light flame
  sport tabs; Tonight's-opponent flame-tint hero (104px real score ring, mono factor bars from
  match-intel's real four signals); suggestion grid → auto-fill 340px cards with micro factor
  grids; band colors per spec (<45 → band-low).
- **§3.4 Turf wars:** face-off grid (30px Space Grotesk regions, VS roundel), mono PTS·PLAYERS,
  tint-flame REPPING pill, mono `{n}D LEFT`, and **the line** (12px sand track, flame-gradient
  fill, white seam dot) — all from real challenge data.
- **§3.5 Courtside:** one 940px panel with ACTIVE/EXPIRED mono strips (real expiry via
  `conversations.expires_at`), 42px `SPORT_TONES` tiles, 55%-dimmed expired rows with mono chip +
  real "Active {n}d ago", lifecycle footnote.
- **§3.6 The playbook:** sport-tint gradient cards (exact tones) with real taglines and the
  RULES·SCORING·TIERS mono footer; How-the-mountain card with the mini-ascent SVG (the page's one
  climb motif).
- **Grammar rollout:** `.kicker` legacy utility **redefined to the mono grammar** (one edit, every
  remaining kicker app-wide converts); `--font-athletic` → **Space Grotesk** (Oswald retired from
  the bundle; package retained); §2.3 kicker + 40px title applied to 16 standard-header pages with
  section-mapped kickers (COMPETE/COMMUNITY/DISCOVER/ACCOUNT).
- **Compliance fixes:** the V2 profile hero band and /me cover wash lost their dark mixes → light
  sport-tint washes (§6: no dark panels).
- **Known remaining (§4 per-page recipe):** deep composition passes (one-panel lists, sunken stat
  tiles, 34px form sweep) on teams/events/settings/admin surfaces; the V3 pill-glow vs
  one-filled-flame tension resolves as those pages get §4 treatment; play/new header; Mountain-hero
  node spacing fine-tune on small screens.

### 2026-07-08 — DAYLIGHT, Increment A (foundations + shell) — spec §1–§2 implemented
- **New design language adopted** from the Claude Design handoff (`KLIMR-DAYLIGHT-SPEC.md`; the
  reference HTML is the style source of truth). Daylight-first, warm, outdoor — "the climb."
- **Token layer flipped** (`globals.css`): warm paper canvas + sun/sky glows + full-page contour
  overlay; warm neutrals (`ink #201B12 · mute #6E6555 · faint #A69C88`), warm rules (+`rule-2/soft/
  hover`); flame family (+`flame-hot/deep/text`, tint borders); Daylight status (grass `#2F9E44`,
  sun/gold, sky info, loss danger, band-low, medals); **warm shadows** (`e1/e2/e3` + `bar` +
  `flame`); radius scale retuned (cards 18 · shells 20 · tiles 11); fonts → **Space Grotesk**
  (display) + **Instrument Sans** (body) — the first new packages of the effort — mono/Fraunces
  stay; selection, warm scrollbar, `tickerScroll` + `nodePulse` keyframes.
- **Sport identity** → the spec's exact fg/bg/border triples (`SPORT_TONES` in sport-chip.tsx;
  tokens carry the fg). Supersedes the previous palette, per the spec.
- **Rail** rewritten to §2.1 light glass (248px, radius 22, blur 14, warm shadow): mono group
  kickers, flame-tinted active with the 3×16 gradient indicator pill, Daylight user pill footer.
  All behavior preserved (accordion, user menu, admin, presence, invite, sign-out). **Reverses the
  June dark Tideline rail** — per the spec + Gabriel's directive. Nav per §2.1 with Feed→**Home**,
  Resources→**Playbook**, **Chats added**; Invites + Sponsorships retained beyond the spec list
  (live destinations).
- **Top bar** → §2.2 floating glass toolbar (34px controls, radius 10): spec search pill,
  tint-flame **NEXT** chip (pulsing dot, mono kicker, ellipsis contract), ghost Calendar/Chats
  with collapsing labels, icon Bell + flame dot, and the **single flame-gradient Match CTA** last.
  Presence + team switcher kept (live functionality) as ghost controls. Shell layout follows the
  reference (rail beside, toolbar atop content) — safe now both are light; the earlier full-width
  hoist is reverted accordingly.
- The scoped tournament theme untouched (spec silent). Real data only: NEXT chip, badges, presence
  all wired to existing props. Lint + build green.

### 2026-07-08 — Visual pass V3, increment 2 — CTA family, focus halo, empty-state policy
- **CTA glow, family-wide:** the guarded transform generalized from the one dominant literal to
  the whole plain-quoted `rounded-full bg-brand …text-white` pill family — **+43 pills across 35
  files** (62 total with increment 1). Primary actions now read with branded presence everywhere.
- **Form focus halo:** every field following the app convention (`outline-none
  focus:border-brand`) gained `focus:ring-4 focus:ring-brand/15` — a soft branded halo on focus,
  applied by guarded transform (fields already carrying a ring were skipped).
- **Empty-state policy (deliberate, after reading the flagships):** the compact dashed *notice*
  (one-line link rows, short centred paragraphs — `/me` up-next, teams hub, profile-unavailable)
  is the **correct** form for inline moments and stays; the tall `EmptyState` primitive is for
  page-level voids. The 49-file dashed family is therefore *policy-compliant*, not debt. No
  toast system exists (inline errors are the pattern) — noted, not fabricated.
- **Known V1 side-effect (flagged for screen review):** text inputs share the card literal, so
  they carry resting `shadow-e1` — a soft, Stripe-like field depth. Keep or strip is a
  one-transform decision after visual review.

### 2026-07-08 — Chrome seam revision + Visual pass V3 (detail energy), increment 1
- **The rail/top-bar seam is structurally resolved** (the V1 frosted-island fix wasn't enough —
  two side-by-side islands still read as a seam). The desktop top bar is now a **full-width
  frosted strip** (the Facebook model Gabriel cited for the rail): it spans the viewport, and the
  rail island hangs beneath it, offset by the new `--top-bar-h` token (sticky top + height derive
  from it, so bar and rail can never drift). Side-by-side corners no longer exist. The team /
  tournament workspace layouts render the same strip unchanged.
- **V3.1 — CTA presence:** `Button` primary / danger carry a branded glow (`shadow-brand/25`,
  deepening on hover); `dark` gets a soft ink shadow; the base transition now covers box-shadow.
  The dominant raw primary-pill literal gained the same glow via a guarded transform (19
  instances / 17 files; anything already shadowed was skipped).
- **V3.2 — Empty-state personality:** `EmptyState` icons now sit in a warm `tint-brand` chip;
  its CTA inherits the new primary glow.
- V3 remainder queued: raw pills → `buttonVariants` adoption, hand-rolled dashed states →
  `EmptyState`, form focus polish, toast/loading micro-interactions.

### 2026-07-07 — Visual pass V2 (flagship heroes) — complete
- **`/me` hero:** the cover carries a bottom-weighted **primary-sport wash** (accent →
  Tideline navy; click-transparent, top buttons untouched); the avatar ring is the sport
  accent at hero weight; the name steps up to 4xl/5xl. The June avatar-over-cover
  structure is preserved exactly.
- **`/profile/[id]` hero (new):** the public profile — the card others see — opens on a
  sport-deep gradient band with a 96px avatar lifted over it in a surface-gap + accent
  ring. Name, verified, reliability, mutuals, context chips, relationship buttons, and
  the blocked state all intact inside the restructured card.
- **Rankings emotional hero:** when the player is on the current board, the header
  becomes their position — a 6xl/7xl athletic `#rank` in the sport's colour, `in
  {place}`, with the honest momentum line (`{gap} pts behind #{rank−1} · top X% of N
  players`; rank 1 reads "Summit"). Unranked/loading keeps the generic header and the
  existing honest empty states; nothing is fabricated.
- **Teams & events verified at the bar:** the kit crest banner (July 1) and the 460px
  photo event hero with in-hero display title already deliver the tournament-caliber
  treatment — no changes made, by design.

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
