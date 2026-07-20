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

### 2026-07-19 — Live: 45UBR3. Doctrine: computed options, read-time validation
- THE QUEUE IS LIVE — the activated_at fix ended the saga (screenshot: Live
  pill, walk-up code, Pause/Turn off). Remaining polish landed with a doctrine
  Gabriel asked for by name:
- **Options are computed, never stored.** Every option list (formations per
  sport, levels, naming modes) derives from lib rules at RENDER time — a rule
  change applies to thousands of existing events on their next load, no
  backfill. The Add-a-court select now uses formationsFor(sport) (no 1v1 beach
  volleyball; padel doubles-only); values outside current rules render a
  "(legacy size)" flag instead of breaking — read-time validation, the
  read-repair pattern.
- **SSR-per-request IS the live connection.** Pages are dynamic server renders
  against Postgres — every load reflects the database now. The failures this
  week were never staleness: they were reads through the wrong lens (RLS) and
  a derived clock (retire) — both now doctrine'd: panel truth reads admin;
  derived state carries its own timestamps. Realtime sockets stay reserved for
  play-state (the queue's polling), not config — subscriptions everywhere
  would add cost and failure modes with zero correctness gain.
- Queue page: bespoke "Back to event page" link removed (the trail owns
  navigation); per-court Display codes (code+court, Copy, Open display) now
  live beside each court in session setup, matching the organizer panel.

### 2026-07-19 — THE LOOP: revive → instant idle-retire. activated_at (0127)
- Gabriel's step-trace caught it in two rows: turn-on verified flag=true
  session=live, and the very next page render reported session=ended. The 12h
  idle retire measured from max(created_at, last match, last team) — a revived,
  wiped-empty, DAYS-OLD session has only created_at, so every Turn on revived
  it live and the next read retired it again. "Worked once on a fresh event"
  = its session was minutes old; past 12h it joined the loop forever.
- Fix: court_sessions.activated_at (0127) = when this queue DAY went live.
  Revival (ensure + standalone restart) stamps it; retire anchors on
  max(activated_at, activity); if 0127 is missing, retire pauses itself
  (correctness over cleanup) and sessionPatch's tolerance now covers both
  0124/0127 columns generically.

### 2026-07-19 — ROOT CAUSE: RLS-silent session reads · full step tracing
- The event page (and my tournament dashboard block) read court_sessions with
  the USER-scoped client. An RLS-blocked select returns EMPTY WITH NO ERROR —
  so the panel rendered OFF while the database was live and the action
  truthfully reported verified success. Every symptom of the week-long saga
  fits this shape: no red line, no diagnostics, "Turning on…" settling,
  persistence across every write-path fix. Rule, now standing: ORGANIZER-PANEL
  DATA READS WITH THE ADMIN CLIENT — panel truth must never depend on RLS.
- Instruments, permanent: (1) every Turn on/off click writes ONE
  "[queue-trace]" row to Admin → Diagnostics with the full step narrative
  (timings, guard, branch, ids, read-back); (2) a page tripwire reports itself
  whenever flag=true but the page can't see a live session — the exact
  divergence that hid this bug.

### 2026-07-19 — Read-back verification closes the last silent shape
- Field evidence narrowed everything: "Turning on…" renders and settles ⇒
  hydration alive, form fired, action completed returning success past EVERY
  existing check. In a fully-checked chain the one remaining silent failure is
  an UPDATE matching zero rows (PostgREST: no error). Turn-on (event and
  tournament) now RE-READS the flag + latest session after writing; unless
  reality says flag=true + session=live it returns a loud error carrying the
  exact read-back, and logs "[queue] turn-on verified {ids}" on the happy path
  — the impossible-silent outcome is now impossible.

### 2026-07-19 — ONE navigation system: BackButton deleted outright
- Gabriel's architectural call, and the right one: after trail-aware
  suppression, every BackButton on the site rendered null — pure dead weight
  duplicating the trail's purpose. Deleted: the component, its
  navigation-history provider (sole consumer), the layout mount, and all 22
  usages (the sweep found 10 more than the icon-pattern purge ever saw —
  settings, play, courts, challenges, chats room).
- Doctrine, stated for reviewers: breadcrumbs are the site's single navigation
  system. The parent crumb IS "back to parent" — deterministic on deep links
  and fresh tabs, where history-back dead-ends (the very case BackButton's
  fallback patched). "Return to wherever I was" belongs to the browser's own
  Back button; duplicating browser chrome is an anti-pattern. Standalone
  surfaces keep their purpose-built escapes, which were never BackButton.

### 2026-07-19 — Back button retired SYSTEMICALLY (schema confirmed applied)
- Gabriel's query confirms tournament_id + team_name_mode exist in prod — the
  0125/0126 theory is closed; the form-action toggle build is the decisive
  turn-on test.
- The event page's lingering "‹ Events" exposed why the purge was fragile: it
  hunted icon patterns while the page used the shared BackButton component.
  Enumerating patterns is whack-a-mole; the reliable fix is a property of the
  component: BackButton now consults the SAME registry that renders breadcrumb
  trails and returns null wherever a trail exists (in-shell, depth ≥ 2) — every
  consumer, current and future, governed by one line of truth. It keeps working
  on standalone surfaces and top-level pages, where no trail renders.

### 2026-07-19 — Avionics pass: the queue toggle survives dead JavaScript
- Field report: Turn on silent again on a FRESH event, zero event-page errors,
  but Diagnostics shows #418 hydration crashes on /feed and a Mapbox teardown
  crash on /marketplace — proof more hydration bombs existed and could kill any
  page's handlers. Structural response, not another patch:
- **Redundancy.** The panel's Turn on / Turn off are now NATIVE FORMS bound to
  the server action via useActionState: JS alive → pending state + inline
  errors; JS dead (crash, stale bundle) → the form still POSTs and the page
  re-renders server-side. The queue's primary control no longer depends on the
  failable layer.
- **Schema tolerance.** ensureQueueLive omits tournament_id when null and
  createSession omits team_name_mode when default + logs-and-degrades otherwise
  — an unapplied 0125/0126 can no longer break turn-on or creation.
- **Hydration bombs neutralized.** The Wire's day buckets/times are viewer-local
  → the whole feed gates on hydration (useSyncExternalStore); events-map guards
  its init-teardown race (cancelled check on load, try around resize/remove).
- /queue/new dropped its event-era `redirect("/events")` — standalone creation
  is first-class from the Live Queue hub, event pre-link still honored.

### 2026-07-19 — Courtside app hardening: validation, security posture, brand
- **No more 404 dead ends.** New GET /api/q/validate pre-flights every code:
  the app connects only when { ok, live }; invalid → "not valid" message,
  found-but-off → "ask the organizer to turn it on". The field never persists
  (clears on open, on success, on failure), and even a race that reaches a 404
  now hits the app's navigationResponse guard → "Start over" overlay instead of
  a stranded kiosk.
- **Security posture (core property: the app holds ZERO secrets).** WKWebView
  locked with App-Bound Domains (WKAppBoundDomains=klimr.com Info.plist +
  limitsNavigationsToAppBoundDomains), our own https+klimr.com-only navigation
  policy, non-persistent website data store (stateless kiosk), https upgrade,
  and a JS bridge that accepts three fixed message types from klimr.com frames
  only. Server surfaces are anonymous-by-design and defensive: /api/q/validate
  returns nothing beyond { ok, live, courts }; /api/app-diagnostics requires
  the x-klimr-app marker, whitelists level, clamps sizes, reflects nothing.
- **App errors flow into Admin → Diagnostics**, tagged "[Courtside]" with
  url app://courtside; the admin page gains a source filter (All / Website /
  Courtside app). Reported: HTTP≥400 display loads, web-process terminations,
  5-consecutive offline failures.
- Display polish: true OLED black base (radial fades to #000), Up-next names
  ~35% larger, guest tag dropped on the big screen, and the Klimr mark +
  Fraunces wordmark join the walk-up panel so the brand is always on screen.

### 2026-07-19 — Breadcrumbs become the SYSTEM · back buttons retired · Live Queue in-shell
- Two-tier breadcrumb system. Tier 1 (zero config): AutoBreadcrumbs mounts once
  in the signed-in shell and derives every in-shell page's trail from a central
  registry (lib/breadcrumb-map.ts — static labels, dynamic-leaf labels keyed by
  parent, structural skips, root-href overrides). Any page added tomorrow gets
  correct crumbs with no wiring. Tier 2 (rich): pages keep/ship their own
  server <Breadcrumbs/> with real titles + data-driven parents; a pure-CSS
  :has() rule hides the auto tier whenever a page-owned trail exists — no JS,
  no hydration risk, correct across soft navigation.
- Legacy back links purged (15 across classes, events/past, marketplace, health,
  resources, settings, tournaments/past, admin ticket) — the trail IS the back
  affordance now. Deliberately kept: /support's "Help center" (top-level pages
  render no trail) and standalone surfaces' escape links.
- Live Queue enters the shell: nav → /queue, a proper in-shell hub (join by
  code — 6 or 7 chars — or create a standalone queue). /q remains the
  chromeless QR / walk-up destination; same codes, same normalization
  (cleanQueueCode/splitQueueCode now shared from lib/queue.ts).

### 2026-07-18 — Courtside kiosk polish: chromeless, self-resetting, louder winner
- In-app detection: /q/[code]/[court] reads the KlimrCourtside user agent and
  the display hides its "Full screen" button inside the app (the app IS full
  screen). The native gear chip is gone too — the organizer escape hatch is an
  invisible 90px press-and-hold zone in the top-left corner (1.2 s).
- First web→native bridge: the page posts { ended | active | exit } to the
  klimrCourtside message handler. On "ended" the app drifts back to its setup
  screen after 30 s (cancelled if the queue springs back to life); the ended
  screen gains an in-app "Start over" button that exits immediately.
- Court-less resilience: a wiped session has zero courts — the display route no
  longer 404s; it renders the ended/asleep takeover with courtId "".
- Winner-stays banner enlarged (label ~40% up, names to clamp 2.2–4.6 rem bold)
  so the team staying on is readable from the service line.

### 2026-07-18 — Live Queue standalone (create from /q) · team-name modes (0126)
- Live Queue graduates to a feature of its own: the /q front door now offers
  "Create" (→ /queue/new) for people just meeting to play — no event or
  tournament required. Standalone sessions already lived at /queue/[id] with
  full settings; the same 12-hour wipe applies. Creation asks everything up
  front, including a NAMED first court (Court A, Green Court…), and courts
  added later keep custom names as before.
- Team naming is now an organizer choice (migration 0126:
  court_sessions.team_name_mode — letters | first_player | initials), offered
  at creation and switchable live in queue settings. Presentation-only by
  design: lib/queue.ts#teamDisplayName computes the shown name from members at
  read time (courtside hold buttons + toasts already wired), stored identity
  stays letter-based, so mode changes mid-session are instant and safe.

### 2026-07-18 — Tournament open-court queues (0125): same system, optional
- Per Gabriel's spec: tournaments get the SAME live-queue concept as an OPTIONAL
  open-court line for players outside the groups/brackets (which remain Match
  schedule's domain). Mostly for events; the capability now exists everywhere.
- Migration 0125: court_sessions.tournament_id (nullable FK, indexed, CHECK one
  owner) + tournaments.queue_enabled. Ownership generalized end-to-end:
  ensureQueueLive({eventId|tournamentId}), retire/end/start flag mirrors flip
  whichever owner, sessionRow/loadSessionState carry tournament_id, and the
  queue page's breadcrumb resolves Tournaments > {title} > Live queue.
- New tournament-staff actions (setTournamentQueueEnabled/Paused/CourtClosed)
  mirror the event trio behind the owner/manager guard. The queue admin panel
  is now scope-aware (one component, both owners) and embeds on the tournament
  dashboard as "Open-court queue" with the bracket disclaimer; codes, courtside
  app, and the /q front door work unchanged.

### 2026-07-18 — Site breadcrumbs (location-based) · Live Queue front door
- **Breadcrumbs** (components/breadcrumbs.tsx): LOCATION, not click-history —
  the NN/g / Google / big-product consensus (path crumbs break on refresh, deep
  links, sharing; Back owns history). Multi-parent pages resolve parents from
  DATA: a queue belongs to its event → Events > {Event} > Live queue however
  you arrived. Depth ≥ 2 only (no lonely self-labels on roots). Chevron style
  on Daylight tokens, truncating, aria-labelled, schema.org BreadcrumbList.
  Wired (21): events detail/edit/past, queue session, tournament detail/past,
  team public, classes detail/past, marketplace deferred, profile, playbook
  sport, play match, challenge, and eight /settings/* subpages. Deliberate
  exclusions: tournament/team WORKSPACE pages (their dark rails ARE the
  locator), public microsites (/e, /q/*, courtside — chromeless by design),
  top-level listing pages.
- **Live Queue front door**: nav item "/q · Live Queue" (named for the
  destination; "Join" is just one verb) added to NAV_GROUPS right after Play —
  desktop rail + mobile drawer inherit from the one source. /q's code entry now
  accepts 7-char COURT codes everywhere ("3ZGARK2" → join normalizes to the
  session; the courtside opener auto-derives the court and pins the stepper).
  This is the phone app's future deep-link target: open /q, type any code seen
  at a venue, land correctly.
- Open design note: sessions attach to EVENTS today; extending the same system
  to tournaments = a nullable court_sessions.tournament_id in a future
  migration, front door unchanged.

### 2026-07-18 — Self-healing turn-on: legacy sessions can't block an event
- Field evidence: identical click works on a freshly created event, fails on the
  long-suffering original — same code, same user, same deploy. The difference is
  DATA: the old event's session row survived a week of schema/lifecycle churn
  and fails revival in a way no individual write reports.
- ensureEventQueueLive now VERIFIES: after the revive patch it reads status back;
  unless the row verifiably says "live", the legacy session is retired and a
  fresh one is minted on the spot (same path new events use). Turn on works on
  every event, clean or scarred. The retired session's walk-up code dies with
  it — nothing playable was ever attached. The failure log records
  { sessionId, err, readBack } for the postmortem.

### 2026-07-18 — Every link in the turn-on chain now speaks; resolver follow-fallback
- Post-hydration-fix evidence: the click fires and the round-trip completes with
  no returned error, no thrown rejection (the reporter does hook
  unhandledrejection), yet the flag reads false. The only write in the chain
  that was never error-checked was the events.queue_enabled flag update — it is
  now checked and its failure message travels to the panel's red line. The whole
  action is additionally try/caught (thrown ≠ returned), and the panel wraps the
  round-trip in try/catch + explicit router.refresh() on success.
- Maps: hop-walk gains a generic nested-URL unwrap (?continue/link/url/q=<url>)
  and a last-resort redirect:"follow" that reads ONLY the final URL (never a
  body) — plus telemetry: "[maps] short-link unresolved { raw, walked, followed }"
  in Vercel logs whenever a link still defeats resolution, so the next fix is
  one pasted log line away, not another guess.

### 2026-07-18 — The dead button was a hydration crash (React #418)
- Diagnostics showed repeated #418 with args[]=text on /events/[id]: the SERVER-
  rendered TEXT differed from the client's. When hydration throws, the server
  HTML stays visible but NO handler is attached — "Turn on" (and every other
  button on the page) was dead regardless of its own correctness.
- Offender 1 — EventShareKit formatted event times with NO timeZone: Vercel
  (UTC) rendered "4:00 PM", the browser (PT) "9:00 AM". Pinned to
  America/Los_Angeles (the site already labels times "PT"). Admin-gated, which
  is exactly why the organizer hit it.
- Offender 2 — top-bar's next-match chip: Date.now() + undefined-locale
  formatting IN SSR'd render. Fixed with a hydration gate via
  useSyncExternalStore (server snapshot false / client true) — the sanctioned,
  setState-free "am I hydrated?" — so SSR and the hydration pass render without
  the viewer-local time, and it fills in immediately after.
- Standing rule extended: any viewer-locale/zone-dependent text in a client
  component must be timeZone-pinned or hydration-gated; Date.now()/toLocale*
  with undefined locale in SSR'd render paths are hydration bombs.

### 2026-07-17 — Turn-on works with or without 0124; failures are visible
- `sessionPatch` (lib/queue-state): every session write that touches `paused_by`
  retries once without it if Postgres rejects the column — the queue functions
  fully pre-0124; only "paused by <name>" waits for the migration. Used by
  ensure/revive, wipe, both pause actions.
- `ensureEventQueueLive` returns `{ id, error }`; `setQueueEnabled` returns
  `{ error }`; the panel renders any returned error as an inline red line —
  the button can no longer dim-and-do-nothing silently.
- The event page's session select falls back to pre-0124 columns on error and
  passes an amber "Run migration 0124…" chip into the panel, so the missing
  migration is announced on the page itself, not just in Vercel logs.

### 2026-07-17 — CI caught what a piped exit code hid
- Run #32's red X was real: the map-preview effect added two sessions ago called
  setState synchronously in its body — the exact pattern the repo's own ESLint
  rules ban. It slipped every "green" check since because the verification
  piped eslint through tail, so `$?` reported tail's exit, not eslint's.
  **Discipline fix: gates are never piped before capturing exit.**
- Resolution was a revert, not a patch: the form already had complete resolve
  machinery (`resolveMapsPoint` → maps-actions → mapsPointFromUrl) that earlier
  greps missed by name; the duplicate effect + duplicate action are deleted and
  the preview inherits the hardened resolver automatically.
- CI workflow bumped to checkout@v5 / setup-node@v5 (silences the Node-20
  runtime deprecation warning on every run).

### 2026-07-17 — Root causes closed: 0124 dependency surfaced · Hampshire autopsy
- **Turn-on "doing nothing" = migration 0124 missing in prod.** The event page's
  session select and the revive update both touch `paused_by`; without the
  column, the select errors → session null → panel renders OFF regardless, and
  the revive fails silently → never live. All three code paths now log loudly
  ("is migration 0124 applied?") instead of failing mute; ensure returns null on
  a failed revive so the flag can't drift ahead of reality.
- **The Hampshire pin, final autopsy.** Expired goo.gl links redirect to the
  bare Google Maps homepage, whose embedded viewport is the REQUESTING SERVER'S
  IP geolocation — the resolver was scraping that default viewport as a "pin"
  (old code and first rewrite alike). Rules now: hop fetches are no-store; HTML
  is consulted ONLY on a concrete /maps/place/ page; the viewport /
  APP_INITIALIZATION_STATE pattern is deleted outright (only a place's own
  latitude/longitude JSON is trustworthy). A homepage landing = failure → null →
  server geocode of the venue text → correct pin, or the honest no-iframe card.
- Panel OFF state vertically centres its content (no dead void under the button).

### 2026-07-17 — Queue v3 (Gabriel's final spec) · per-court codes · honest map
- **No auto court.** Turn on = live, then the organizer sets up courts — as many
  as needed, named freely (Court 1 / Court A / Green Court). Auto-seeding
  removed from ensure + restart.
- **Auto-off = the same OFF.** Idle retire moved to 12 hours and now performs
  the identical full wipe (courts, players, settings; code survives) and flips
  the event toggle — a queue left on Sunday reads plainly OFF Monday morning.
- **Per-court display codes.** A court's code = session code + court number
  ("3ZGARK2" = court 2; six chars alone = court 1). The panel prints each
  court's code in big mono with copy, a display link, and Close/Reopen
  (new event-admin action setEventCourtClosed → queue_courts.closed_at; closing
  waits for the live match). The Courtside iPad app parses the 7th character.
  Pause all / Resume all sits above the court list; walk-up link at the bottom.
- **Panel copy cut to the bone** ("Turning it off clears courts, players, and
  settings." is the entire OFF explainer). Organizer grid `items-start` →
  `items-stretch` + h-full cards so the queue and admins panels match heights.
- **Map can no longer lie.** EventLocationMap renders its iframe ONLY with a
  real coordinate; with none it shows a clean "Open in Google Maps" card (the
  keyless embed's text geocoding — the Hampshire pin — is unreachable). If both
  the link resolver and server geocode fail, the event page logs
  `[maps] unresolved event pin { hasKey }` — in prod that flag exposes a missing
  GOOGLE_MAPS_API_KEY instantly.

### 2026-07-17 — Queue = play switch · panel redesign · maps resolver hardened
- **Queue model, final form (Gabriel's spec):** ON = playing (create-or-revive
  the session, seed Court 1 if bare, live unpaused — one tap; `ensureEventQueueLive`).
  OFF = blank slate (`wipeSession`: play state, courts, AND tuned settings clear;
  only the session row + public code survive for printed QR). PAUSE = named
  intermission: `court_sessions.paused_by` (migration 0124) records who; the
  courtside pill, queue chip, join gate, and start-next error all say
  "<name> has paused the games — the match on court can finish, the next one
  waits." Manual End on the queue page = the same OFF. "Start today's queue"
  action deleted — the state no longer exists.
- **Organizer panel redesigned (event-queue-admin):** status pill (Off / Running
  / Paused-amber); OFF shows one big "Turn on the queue"; RUNNING leads with the
  SESSION CODE in huge mono (organizers read it into the Courtside iPad far more
  than they click it) + copy, then Pause/Resume · Courtside display · Queue
  settings · quiet Turn off, then both public links as labeled copy chips.
  "Spread the word" (ShareKit) rehomed inside Organizer tools; "Edit event
  details" upgraded to a solid ink button.
- **Maps resolver rebuilt:** Google sunset consumer goo.gl; scraping URL
  patterns out of interstitial HTML produced one deterministic junk pin
  (Hampshire) for every link. Rules now: URL patterns run on URLs only (each
  redirect hop, with consent.google unwrapping); /maps/place/<name> geocodes the
  name; HTML is consulted only on real google.*/maps pages with page-specific
  patterns. Edit-form preview resolves short links through the same server
  resolver (`app/events/map-actions.ts`, debounced) — the form's `resolvedPoint`
  was previously never set.

### 2026-07-17 — Queue is ONE switch: session state mirrors the event toggle
- Field feedback: auto-retire worked ("Queue ended — ready for the next session")
  but the panel still LOOKED on — dark, with a Turn off button. The two-state
  model (feature enabled vs session status) read as a contradiction. Collapsed:
  for event-linked sessions, `events.queue_enabled` now mirrors session liveness.
- The day ending — idle retire (lib/queue-state) OR the organizer's manual End —
  also flips the event toggle OFF: panel shows the plain off state, walk-up /
  courtside links hidden until next time. Going live — Turn on (auto-activate),
  startSession, or restartSession — flips it back ON. Standalone (non-event)
  sessions are untouched; every flip is gated on `event_id`.
- The organizer's weekly loop is now: arrive → Turn on (one tap, straight to
  live) → play → walk away → it turns itself off. The "ended but enabled"
  panel copy remains only as a transient fallback.

### 2026-07-16 — Field-test fixes: rails, event map, courtside safe-areas, queue lifecycle
- **Workspace rails (tournament + team):** the account/View-public-page footer was
  inside the scroll container, so it scrolled away. Now: scrollable middle
  (min-h-0 flex-1), pinned footer with border-t, scroll-fade + chevron moved to
  the bottom of the SCROLL AREA (above the footer), not the rail.
- **Event map = event link, always.** One pin source: court's stored lat/lng →
  the organizer's Maps link (location_url, else the FIRST Maps link harvested
  from the description — `firstMapsUrlInText`) → server-side `geocodeAddress`
  (Geocoding API, same GOOGLE_MAPS_API_KEY, 30-day cache). The keyless embed's
  own text geocoding is banned as a source — it once sent "Santa Monica, CA" to
  a lane in Hampshire. The Where link uses the same resolved URL.
- **Courtside display:** header is safe-area padded and CENTERED (iPadOS floats
  its own ✕ dismiss top-left in fullscreen; the status bar owns the top edge —
  centring keeps our content out from under both). Clock scales with HEIGHT
  (clamp 17vh; 16vw exploded on wide-short iPads). Bottom strip goes side-by-side
  from `landscape:`/lg (xl never fired on iPad, stacking the QR below the fold);
  safe-area bottom padding; names centre via my-auto (items-center +
  overflow-y-auto top-pins in Safari). Status-aware: ended/setup takeover screens,
  Paused pill, start disabled while paused, queue/QR strip only while live.
- **Queue lifecycle contract (the big one):**
  - `retireSessionIfStale` (lib/queue-state): a live session idle 6h+ ends itself
    on ANY read — polling API, SSR queue pages, and now the EVENT PAGE (which
    previously bypassed it with a raw query, so the panel said "on" for days).
    Retiring also finalises any zombie live match.
  - Event "Turn off" now performs the 0094-documented reset via shared
    `clearSessionPlay`: teams/matches/requests wiped, status→setup, unpaused —
    courts, settings, geofence centre and the PUBLIC CODE survive.
  - Event "Turn on" auto-activates the existing session (ended→clear+live,
    setup→live) — one tap, no second switch inside the queue.
  - New `restartSession` backs "Start a new session" (plain startSession used to
    resurrect stale play state). New `startEventQueue` backs the panel's
    "Start today's queue" when the last session ended.
  - One session per event: createSession redirects to the existing session
    instead of minting a duplicate (which would fork the printed QR code).
  - Server guards on the public by-code engine: start-next and step-down verify
    session status server-side (the courtside code is the only credential).
  - Queue page hides the courts grid once ended; the event admin panel is
    status-aware (running / set up—not started / ended—Start today's queue).
- **Promo copy is organizer-only:** EventShareKit renders behind isAdmin.

### 2026-07-16 — Sport icons v3: Gabriel's Claude Design set, wired site-wide
- VERDICT: v1 (sticker) and v2 (equipment redraw) are superseded. Gabriel produced the
  final set himself in Claude Design — 5 sports × 3 tiers, hand-inked outlines on the
  warm palette. `components/sport-icons.tsx` fully replaced: icons are now static
  assets in `public/sport-icons/` rendered via `<img>` (a 40-row feed references one
  cached file instead of 40 inline SVG subtrees; the PNG sport shares the code path).
  `sportIconSrc(sport, variant)` serves non-React sinks (Mapbox popup HTML strings).
- Tiers renamed to match the assets: **badge** (circular ball emblem — chips, list
  rows, nav, inline mentions like "Completed a 🏸→[badge] Tennis match"), **glyph**
  (equipment — tinted medallions, pickers, tiles, card covers), **hero** (rotated
  action composition — wizard lineup/config watermarks, team & tournament page
  watermarks, event hero cover, guest-join, rankings empty state).
- Beach volleyball shipped as 768px PNG (others SVG): quantized to 256-color palette
  at 256/512/768 px per tier → 6/12/16 KB. Component API is identical across formats.
- `SportChip` leading dot upgraded to the badge icon; `SportDot` still exported but
  retired from all call sites (invites, network, teams rows now render badges).
- Unknown sport key renders a neutral ink dot — never a broken-image glyph.
- Deliberate emoji retentions (text-only contexts where an <img> cannot exist or
  meaning demands it): native `<option>` labels in all create/edit selects,
  EventShareKit promo payloads (WhatsApp/SMS plain text), `lib/calendar.ts` ICS,
  marketplace "multi" 🏅 (no asset for the pseudo-sport), invites-browser `emoji`
  field (kept as medallion-vs-avatar discriminator + fallback), network-browser
  `sportEmoji` (load-bearing in its sports-map guard). Everything else site-wide —
  ~40 files — now renders the illustrated set.

### 2026-07-16 — Verification data promise: disclosed everywhere, true in the code
- Research (cited in-thread): X discloses this exact model ("We use Persona, and Stripe
  for ID verification… X does not directly retain this data"); Stripe's integration docs
  bless status-only as the privacy-first default (choose the minimum PII; skip the
  restricted key for sensitive data); Stripe's go-live checklist notes GDPR may require
  a non-biometric alternative — Klimr's manual review IS that path; Stripe retains
  documents as processor, deletion requests flow business+partner.
- components/verification-privacy.tsx — <VerificationDataPanel>: "Your documents never
  touch Klimr's servers" + WHAT WE STORE (status / changed-at / partner reference for
  audit) vs WHAT WE NEVER STORE (document scans, selfie/biometric data, barcode
  contents), non-biometric path note, deletion-relay note. Placed on: wizard step 5
  (compact, above consent), /verify/continue (compact), Settings → Verification (full),
  and a matching "Identity verification data" subsection in the Legal privacy section.
- Architecture already true: no code path writes ID imagery anywhere; handoffs store
  tokens only; profiles store status.

### 2026-07-16 — Wizard step 5: identity verification (optional) + drafts + handoff (0123)
- Research (cited in-thread): Persona's device handoff = QR + short copy link below it;
  Stripe Identity desktop shows a QR to continue on mobile w/ "other options" (email/
  text/copy/stay); platforms store STATUS ONLY, never documents. Matches our standing
  vendor decision (Persona / Stripe Identity class for gov-ID + selfie; manual admin
  review until go-live).
- **Wizard is now 6 steps** — "Verify identity" (optional) before Review: benefits card,
  legal-consent block (documents to partner; Klimr keeps status + audit metadata only),
  method tiles: Request a review (LIVE → verification_status 'pending', the existing
  admin manual queue), Continue on your phone (LIVE → QR via react-qr-code + copy link;
  "Text me the link" greyed SOON until Twilio), Government ID + selfie match and
  Driver's-license barcode both greyed SOON. Skip = Continue; rail summary reflects
  queue/later. Requested state survives reloads (draft + status='pending').
- **Autosave**: profiles.onboarding_draft jsonb — snapshotted on every step advance
  (saveWizardDraft, ≤8kb), merged draft-first into the wizard's initial on load, cleared
  by the final save. Never touches the completion gate.
- **Handoff**: verification_handoffs table (single-use uuid token, 30-min expiry, RLS
  service-only). /verify/continue (no login: the token is the credential for this one
  low-risk action) validates → consent copy → confirm consumes token + files 'pending'
  → /verify/continue/done. Becomes the IDV entry point when the partner goes live.

### 2026-07-16 — Verified identity lock · tournament workspace mobile chrome
- **Identity immutability**: once profiles.verification_status = 'verified', legal name
  and date of birth are locked. Enforced SERVER-SIDE in saveProfileBasics (values
  re-sourced from the DB; attempted changes return a support-directing error) and
  surfaced in the UI (disabled inputs + hidden mirrors + green ShieldCheck notice on
  Settings → Profile). Bio/ZIP/gender/timezone stay editable. Wizard unreachable when
  verified (isEdit redirects), so Settings is the only surface.
- **Phone back-button mystery solved**: tapping a tournament card routes owners/managers
  to the /tournament/[id] WORKSPACE, whose rail and TopBar are both md+ — phones got
  ZERO chrome. New mobile-only sticky strip (md:hidden): "← Klimr" chip → /tournaments,
  truncated tournament title, glass blur. Public visitors on /e/[code] already had the
  auth-aware "Go to Klimr" pill.

### 2026-07-16 — Sport icons v2: redrawn from real equipment (verdict pending)
- v1 rejected as rough/cartoonish (thick lines; tennis + racquetball shapes wrong; BV
  ball unrecognizable). v2 drawn from researched references on a finer 48-grid with
  0.5–1.6 linework and computed string chords: tennis = elongated strung oval, open-V
  throat, wrapped grip, optic ball w/ true seam; pickleball = SOLID modern paddle
  (v1's face holes were wrong — the BALL has holes) w/ edge guard + wiffle ball;
  padel = diamond face w/ visible 38mm sidewall (double contour), carbon face,
  perforation rows, wrist cord; racquetball (Gabriel plays) = Gearbox-style teardrop —
  strings ~60% of length to the throat, top bumper, colored frame, wrist tether;
  beach volleyball = Wilson AVP/OPTX swirl-panel geometry (yellow/blue swaths, sweeping
  seams, sheen). Component in repo, still wired NOWHERE — preview regenerated.

### 2026-07-15 — Klimr Sticker Icons (components/sport-icons.tsx) — AWAITING VERDICT
- Hand-drawn SVG sport marks in one grammar (ink #201B12 outlines, warm flats, subtle
  shade) on a 24-grid; THREE tiers per sport: mini (rows/chips), icon (cards/pickers),
  crest (wizard config headers, empty states, marketing). Disambiguation is structural,
  not stylistic: tennis = strung oval + optic ball; pickleball = SOLID holed paddle +
  wiffle ball; padel = perforated teardrop (+ glass wall in crest); racquetball = long
  strung teardrop with the wrist cord + blue ball (+ court corner); beach volleyball =
  paneled flame/violet ball (+ net; palm/sun/sand crest). Component shipped but NOT yet
  wired into any surface — preview sheet staged (klimr-sport-icons-preview.html);
  rollout mapping proposed (emoji → SportIcon by tier) pending Gabriel's review.

### 2026-07-15 — THE WIRE: the feed reinvented for volume (research-backed)
- Research: Reddit's redesign backlash — "1/3 the info on-screen, no compact mode" —
  proves users equate feed quality with DENSITY and control (they also rush to disable
  forced recommendation inserts); Strava's scale answer is ONE grouped entry per shared
  happening, and the most popular third-party Strava tool is a feed FILTER extension —
  direct evidence platforms under-deliver type filtering. Synthesis: density + grouping
  + user-controlled filters + bounded length + read-state.
- components/feed-wire.tsx replaces the big cards (≈380px → ≈44px/row, ~9× denser):
  ledger rows (kind dot + icon + bold headline — meta, sport emoji, mono age, chevron);
  member posts get two-line previews + inline optimistic ♥ (togglePostLike). Day
  sections read like newspaper editions (Today/Yesterday/date). Same-kind bursts ≥3
  auto-roll into expandable rollups (count + first-two teaser). Filter strip: per-kind
  toggle chips in each kind's accent, persisted (klimr.wire.hide). Unseen rows carry a
  flame dot (klimr.wire.seen, stamped 2.5s after mount). HARD-CAPPED: 45 blocks + one
  in-memory "Show earlier (N)" — no infinite scroll; footer states the retirement
  policy. Server keeps ranking/lanes/enrichment; page maps entries → WireRow[]
  (page 543→478 lines). Ticker, hero, composer, live pill, rail untouched.

### 2026-07-15 — Tablet round: scroll-hint rails · glass bar · invite lifecycle · time zones
- **Accordion undone (both rails)** — tablet usability verdict: compact/openSection
  machinery removed from side-nav AND tournament-nav (sections always open); the rails
  scroll (scrollbar hidden) with the modern affordance instead: a soft bottom fade into
  the card's own color (#FFFDF8 / #210c05) + a gently bouncing ChevronDown, driven by
  scroll+ResizeObserver, vanishing at list end. Width-collapse (icon rail ≤1180) stays.
- **Top bar reverted + glass**: the full-width restructure is undone (bar back inside the
  content column; --topbar-h publisher and rail offset removed). The seam is solved by
  subtraction: the opaque bg-bg strip is GONE — the bar is a floating glass card
  (bg-[#FFFDF8]/72 + backdrop-blur-xl + saturate-150, white/50 border, black/4 ring,
  solid fallback when backdrop-filter unsupported). Nothing left to collide with the
  rail gutter; content scrolls under the glass.
- **Invite codes consume at the gate** (they never consumed anywhere — root cause of the
  "still unused" report): atomic uses+1 with optimistic guard at enterSite; the claim
  lives in a 72-hour cookie (gate + klimr_invite both 72h); signup precheck honors the
  claim-holder (cookie match ⇒ valid even at max uses); lapse ⇒ new code (spent one
  stays spent). Admin Codes reflects uses + last_used_at immediately.
- **Time zones (0122)**: profiles.timezone — auto-captured at signup (device IANA zone,
  hidden input → saveProfile), editable in Settings → Profile (Intl.supportedValuesOf
  select); Admin Diagnostics timestamps render in the VIEWER's zone (fallback LA).

### 2026-07-15 — Journey rail rhythm: room for the straddling chrome
- The Edit chips and on-border labels protrude ~12px above each parchment card, but the
  rail's space-y-3 left only 12px between items — chips visually touched the card above
  (iPad screenshot). Rail steps now breathe at space-y-6 (24px), and summary cards gain
  a touch more internal headroom (pt-[18px], pb-4) so the label sits comfortably on a
  taller top edge. Uniform spacing across done/active/ghost rows keeps the column's beat.

### 2026-07-15 — Rating field: hide when the sport has no system + spaced layout
- Beach volleyball's sports.skill_system = 'NONE' leaked as a literal "NONE · optional"
  label (iPad screenshot). BV has no numeric self-rating (CBVA divisions are letters) →
  new hasRatingSystem() in sport-play-options hides the input entirely for null/'NONE';
  tennis NTRP / pickleball DUPR / padel Level / racquetball USAR keep theirs, now labeled
  "<SYSTEM> rating" with a helper line. Settings sports editor mirrors via a local
  SKILL_SYSTEM map (client-only surface) — hidden for BV there too.
- Layout: the rating field left the cramped inline actions row — it's its own block
  (OptionGroup-style label, "· optional" properly spaced, w-32 input, helper text);
  Add/Cancel sit on their own row beneath.

### 2026-07-15 — Wizard photo block: uploader owns the row
- AvatarUploader renders its own complete row (avatar + camera badge + "Add a photo" +
  trust copy), so wrapping it in a flex beside a duplicate title crushed the right column
  (iPad screenshot). Fix: the uploader stands alone in the card; the hue dots move to a
  hairline-separated row beneath ("No photo yet? Pick your color:"). No duplicate copy.

### 2026-07-15 — iPad round: six fixes (chrome, sport truth, seam, cropper)
- **Onboarding is chrome-less** until finished: "onboarding" joined STANDALONE_SECTIONS
  (nav-chrome) — no rail/top bar during signup; /onboarding only serves incomplete
  profiles (edit mode redirects to settings), so the rule is unconditional.
- **Per-sport play truth** — new lib/sport-play-options.ts, one source for wizard AND
  settings/sports editor: beach volleyball = Team size 2s/3s/4s/Any + "Dominant hand"
  (no racquets, no singles); padel = doubles-only (locked, playful note); pickleball =
  "Paddle hand"; tennis/racquetball keep Singles/Doubles/Both + "Racquet hand".
  playFormatLabel maps legacy 'both' for BV to "Any size". DB vocab unchanged.
- **Summary chips**: step-1 rail card shows ZIP / Born <formatted> / gender as separated
  bordered chips (no more run-on meta line).
- **Width rebalance**: journey rail minmax(280,336) · gap-10 — work card wider.
- **THE SEAM (long-standing)**: TopBar physically lived inside the right column, so its
  bg-bg strip stopped at the rail gutter. Restructured app-chrome: MobileTopBar + TopBar
  are now full-width rows ABOVE the [SideNav | content] row; TopBar self-measures into
  --topbar-h (ResizeObserver → documentElement), SideNav sticks at
  top-[var(--topbar-h)] with h-[calc(100dvh-var(--topbar-h))]. No hardcoded px.
- **Wizard uses the real AvatarUploader** (crop dialog, optimistic preview, remove) —
  gained an optional onUploaded callback so the journey rail's summary shows the photo.

### 2026-07-15 — Events: no capacity cap, ever (host-optional only)
- Superseding the 12→40 change same-day: the community-bounds capacity clamp is REMOVED
  entirely. Capacity defaults to unlimited (null); the host may set a number in event
  settings if they want one. Form: placeholder "Unlimited" + "leave blank" helper.
  Downstream already null-safe (full/spotsLeft/share-kit spots line all guard on null).
  Community bounds now: free · open_play/social · ≤2 upcoming. Organizer status gates
  paid + all kinds.

### 2026-07-15 — Community cap 12→40 · location_reveal ('DM for location' as a feature)
- Community-event capacity clamp raised 12→40 (Gabriel: Sunday volleyball outgrew 12) —
  one constant in createEvent; free/kinds/≤2-upcoming bounds unchanged; Organizer status
  still unlocks paid/any-kind/uncapped.
- **0121**: events.location_reveal 'public'|'rsvp' (default public). Form toggle beside
  the location fields ("Share exact location only with people who RSVP"). Detail page:
  locked viewers (not owner/manager/going) see neighborhood/city + "Exact spot after
  RSVP" chip — no court name, no address link, no map. Browse cards show "Location after
  RSVP" and contribute NO map pin (eventPoint short-circuits). Share kit emits
  "📍 Location shared once you RSVP" for locked copies. RSVP → full location on next
  render, host/managers always see everything.

### 2026-07-15 — Event share kit (one-click platform-formatted promo)
- Born from a real WhatsApp ad in Gabriel's beach volleyball group. Gap analysis: every
  element of the ad maps to existing event fields (title/kind/description/starts+ends/
  court|location_text/cost_text/capacity/cover; events even carry whatsapp_url already).
  Two honest gaps noted for the roadmap: reveal-location-to-RSVPs-only (the "DM for
  location" pattern) and nothing else — donations stay host-side text in cost_text (no
  payment features per directive).
- components/event-share-kit.tsx on every event page (after the location map): "Spread
  the word" — WhatsApp (*bold* markers, emoji lines, airy breaks), Instagram (caption +
  auto hashtags), X/Threads (280-char cut), SMS (one-liner). Each format carries the
  event's RSVP link; preview pane + one-click clipboard copy with a green "Copied" state.

### 2026-07-15 — Onboarding wizard v2: the journey rail (Gabriel's original idea, realized)
- Structural redesign answering six critiques at once. The dead left column becomes the
  **journey rail**: every step in fixed order — done steps as parchment summary cards
  OUTSIDE the work container (Edit chips, split-gradient on-border labels: transparent →
  #F7F2E4 at calc(50%−1px), h-16px — the filter-label fix applied), the active step as a
  flame-barred "STEP N · NOW" card, pending steps as dashed ghost rows. The step-order
  bug (editing 2 dropped it below 5) is dead by construction: the rail maps STEPS in
  order; editing just moves the highlight. The right card holds ONLY the active step at
  full width.
- Steps 6→5: sports+how-you-play MERGED into "Build your lineup" — pick a sport from a
  playful tile grid (scales to dozens; 56px gradient medallions + crest-style rotated
  emoji watermarks), configure everything in a focused tinted panel (experience/format/
  hand as **OptionRow radio rows w/ blurbs — zero pills**, big rating input), then "Add
  {sport} to my lineup"; lineup cards carry summary line + primary star + Edit/Remove.
  Match style joins the same step as an OptionGroup.
- Profile photo lands in step 1: circular preview + upload via the existing
  createAvatarUploadUrl/commitAvatar rails (uploadToSignedUrl client-side, 5MB/type
  guards, spinner overlay); hue dots move beside it (identity in one place).
- Font scale-up throughout: inputs 16px, options 15px, summaries 14.5px, metas 13.5px —
  no more 11px body text. Page shell handed to the wizard (page.tsx mounts it bare).

### 2026-07-15 — Realtime "callbacks after subscribe()" (diagnostics flood) fixed
- Root cause: static channel topics ("notif-badge", "courtside-live", "feed-live") —
  supabase-js returns the EXISTING channel for a repeated topic, so overlapping mounts
  across layouts (app top bar ↔ /admin's own bar) had the second mount attach
  postgres_changes to an already-subscribed instance → unhandled rejection on every
  layout transition (the /admin + /tournaments entries in Diagnostics). Cleanup existed;
  the collision was the shared topic itself.
- Fix: **unique topic per mount** (`name:${random}`) on all three channels — collisions
  impossible by construction; badge cleanup also uses the captured client instance
  instead of re-calling createClient(). Standing rule: realtime channel topics in
  components must be per-mount unique.

### 2026-07-15 — Broadcast "Database error finding users": seed rows broke GoTrue
- listUsers 500ed platform-wide because the dev seed inserted auth.users rows with NULL
  token columns; GoTrue scans expect EMPTY STRINGS (confirmation_token, recovery_token,
  email_change*, phone_change*, reauthentication_token) + is_sso_user/is_anonymous set.
  The @klimr.test exclusion in the broadcast action couldn't help — the listing itself
  failed before filtering. Fix: repair UPDATE for existing seed rows (delivered verbatim)
  + dev-seed.sql inserts now include the columns explicitly. Lesson recorded: any manual
  auth.users insert must satisfy GoTrue's empty-string contract or the ENTIRE admin user
  API breaks.

### 2026-07-15 — Tournament rail: compact accordion (the second adaptive layer)
- Scrollbar hiding treated the symptom; the main rail's real short-screen answer is the
  compact accordion — under max-height 960px the labeled sections (Setup/Registration/
  Competition/Promotion) become one-open-at-a-time toggle headers (ChevronDown rotate,
  grid-rows 1fr↔0fr 200ms) so the menu NEVER needs to scroll. Ported verbatim from
  side-nav: openSection follows the pathname's section; Dashboard (headerless) always
  visible; icon-collapsed mode shows all rows with hairline dividers between sections
  (accordion N/A when rows are 44px icons). Tournament rail now carries the main rail's
  full contract: width collapse + overlay + persisted choice + compact accordion.

### 2026-07-15 — Tournament organizer rail: main-rail adaptive contract
- The org dashboard's dark rail was the last pre-system aside: fixed w-64, visible inner
  scrollbar on short laptops, no collapse. Reworked to the main rail's exact mechanics
  (mirrored from side-nav, storage key **klimr.trail**): auto icon-rail (76px) ≤1180px with
  **overlay expansion** (absolute 232px card, page never reflows; closes on nav/outside/
  Escape), persisted chevron choice above 1180px, transition-[width] 200ms, chevron at
  -right-[11px] top-[22px] (aside is the positioning context — the stacking lesson).
- Collapsed grammar: emoji tile w/ title tooltip, kickers hidden, icon-only rows (h-11
  centered, tooltips), footer = globe + avatar only. Scrollbar hidden on the card
  ([scrollbar-width:none] + webkit) — still scrollable, never visible. Phone untouched:
  the existing md:hidden top tab strip already handles small screens.

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

### 2026-07-14 — 180-day gate live + THE CLIMB (permanent history graph) · 0120
- **0120**: player_sports.last_result_at (+ full ledger backfill + activity index);
  ranked_players recreated with the approved 180-day visibility gate + last_result_at in
  the return (drop/recreate — return-type change; grants restored). Every percentile/
  standings consumer of the RPC becomes active-cohort by construction. Award sites (queue
  + tournament) stamp last_result_at on every result. Ladder rows show a faint last-played
  chip (today/3d/2w/4mo).
- **rank_history**: (user, sport, week) → points + rank; nightly snapshot job upserts the
  current week's row (converges to end-of-week); one-time backfill reconstructs points-
  only weekly series from both ledgers (rank unknowable in hindsight; zero weeks skipped).
  RLS: authenticated read.
- **components/rank-history-chart.tsx** on every profile ("THE CLIMB", after the hero):
  hand-rolled SVG — Catmull-Rom smoothed line, flame area fill, Points|Rank toggle (rank
  inverted, #1 on top), per-sport pills sorted by current points, adaptive month/year axis,
  zero-filled valleys for honest pauses, pointer crosshair + dot + readout, peak/best-rank
  stat line, dashed empty state. nowMs threaded (module clock helper — purity rule).
  Container was reset this session: all unzipped rounds replayed from transcript before
  this build (verified by full green + rebuild battery).

### 2026-07-14 — (session-consolidated) Ladder · broadcast · attestations · ranking spec
- **Hosting ladder (Gabriel: 1B/2A/3D/4C/5C/6C/7A/9DE/10BCE/11B/12B)**: bounded community
  events for all members (free · open_play/social · cap 12 · ≤2 upcoming, createEvent-
  enforced); tournaments TD-only (guard + hidden hub buttons); Organizer/TD = free
  applications on provider rails (category "organizing", agreement blocks, phone for
  organizer); zero payment language; Settings-only discovery ("Professional & hosting");
  no grandfathering; profile badges (TD/Organizer/Verified Pro). 0117.
- **Admin Broadcast** (/admin/broadcast + nav): audiences all/organizers/TDs/pros via
  paginated listUsers ∩ approved roles (seed accounts excluded), branded shell, typed-SEND
  confirm, audit rows (broadcasts, 0117) with sender + counts.
- **Per-listing attestations (0118)**: venue attestation checkbox per tournament (wizard
  step; createTournamentFromWizard stamps host_agreed_at + venue_attested_at); event host
  acknowledgment (form checkbox → host_ack_at, action-enforced); participant disclosures
  at event Join and both tournament signup forms; "Free during launch" copy removed.
- **Ranking**: docs/RANKING-POINTS.md v1.2 — computed tables, LIVE vs PROPOSED (format
  factor 1/.8/.7/.6/.5; organized-match 15/5 pending result reporting; √N champBase v1.1
  after Monte Carlo proved steady state + linear mega-draw distortion). **0119**: snapshot
  fn reads player_sports (was full-ledger lifetime queue-only sum — scale + correctness
  bug), emitter contract preserved; composite ledger indexes. §11: 180-day ladder
  visibility gate approved (points intact, active-cohort percentiles, last-played chip).
- Mobile: FilterGroup label geometry (h-14, split at 50%−1px); drawer clip cage (WebKit
  phantom-scroll fix).

### 2026-07-14 — Group label: split background (kills the white box)
- The emulated on-border label used bg-surface, which painted a visible white rectangle
  against the cream page ABOVE the border line (iOS screenshots). Universal fix in
  FilterGroup: the label's background is now `linear-gradient(to bottom, transparent 45%,
  var(--color-surface) 45%)` — top half transparent so the page shows through, bottom half
  surface so the 1px border is masked and blends into the container. Works over any page
  background; no per-page knowledge needed.

### 2026-07-14 — Mobile polish: Safari-proof group labels · stacked decks · composer fit
- iOS Safari renders <legend> gaps inconsistently (the "border doesn't end next to the
  title" screenshots). FilterGroup no longer uses native fieldset/legend: div[role=group] +
  absolutely positioned label (−7px top, bg-surface px-1.5, leading-none) masks the border
  to exactly the text width — identical in every browser. pt-3 replaces the legend's flow
  space.
- Facet decks (events, classes, play, courts explorer): flex-wrap's ragged rows paired
  unequal boxes on phones → "random spaces." Now `grid grid-cols-1` under sm (full-width
  stacked boxes, uniform 12px gaps), the flex deck from sm up. 
- FeedComposer placeholder shortened to "Share something with players nearby…" — the long
  example list clipped inside the field on phones.

### 2026-07-14 — Play court filter: sport-aware everywhere
- Courts carry sports[]; neither the search nor the nearby default consulted it (tennis
  selected → padel clubs listed). Fixed at all three surfaces: searchCourts(q, sport) adds
  `.contains("sports",[sport])` on both branches (ZIP box + name/city); the page's nearby
  query does the same for the default list; the client refetches on activeSport change
  (effect deps [q, activeSport]) so an existing search re-scopes the instant the sport
  radio changes — before or after typing, per Gabriel's spec.

### 2026-07-14 — Drawer bottom-bar bug: stacking escape + single scroll surface
- The drawer rendered INSIDE the sticky mobile header (z-40 stacking context), so its
  z-[59] only won within that context — the sibling bottom nav (z-40, later in DOM)
  painted over the account rows (same disease as the rail chevron). Fix: MobileMenu moved
  outside </header> (fragment) → root context → drawer + scrim genuinely cover the bar
  (scrim dims the bar's visible left strip; taps there close the menu).
- Per Gabriel: the menu is now ONE scroll surface — the account section (Admin/My profile/
  Account/Settings/Invite/Sign out) merged into the nav scroller behind a hairline, pb-6
  tail room; only the avatar header stays pinned for the X. Sign out can never hide again.

### 2026-07-14 — Facet polish: pinned "All" rows · natural deck heights · Courts converted
- Gabriel's screenshots caught two real defects. (1) The Play deck's `items-stretch` forced
  Sport to Court's height → phantom bottom gap, and All-sports living inside the scroll made
  6 rows (192px) overflow the 176px cap → a pointless scrollbar. Fix: **FilterGroup gains a
  `pinned` slot** — fixed above the scroll area behind a hairline, never moves — used for
  "All sports", "All courts (near you)", and the active-court pin; with "All" out of the
  scroll, five options fit clean again. Decks switch to **items-start** (natural heights,
  tops aligned) across events/classes/play.
- (2) The careful re-scan (broad conditional-pill pattern, then manual triage of 12 hits —
  the rest were status badges/tabs) found ONE true straggler: **courts-explorer** radius
  segmented-control + sport pills → two FilterGroups (Within · Sport, radio FacetRows);
  dead `chipStyle` removed. Pill sweep now actually complete.

### 2026-07-14 — Play court filter v2 (any court, searchable) · pill retirement complete
- Gabriel's correction: courts-with-matches-only missed the point — checking a QUIET court
  is the feature. v2: default list = ten courts nearest the member's home ZIP with live
  open-match counts (zeros shown faint); FilterGroup footer carries a debounced search
  (300ms → searchCourts server action): 5 digits = ZIP (courts nearest that ZIP via
  bounding box + haversine), anything else = name/city ilike; distances relative to the
  viewer's home. ANY court id is honored in ?court= (identity fetched even with zero
  matches; selected court pins atop the list). Single unfiltered match fetch now feeds BOTH
  facets' counts (sport filter moved from SQL to JS).
- Sport pills on Play → FilterGroup/FacetLink radios with counts; FilterPill deleted.
  Discover's flame-selected sport pills (double violation: pills + flame-as-selection) →
  the facet standard. Tournaments' `near` is a lookup input, not pills — left as is.
  Sitewide pill sweep complete.

### 2026-07-14 — classes.format → class_format (seed error #3, also a live code bug)
- 42703 on the seed exposed that the column is **class_format** (0078, vocabulary
  group_class/clinic/private_lesson/workshop/camp/open_play) — the earlier types check
  regex-matched the tail of `class_format`, so the parity round shipped a select on a
  nonexistent `format` column (Supabase selects aren't compile-checked → the browse query
  would have errored at runtime). Fixed in three places: dev-seed.sql (column + vocab
  values), app/classes/page.tsx (select + Cls type + mapping; browser keeps its internal
  `format` field), classes-browser FORMAT_LABEL now labels the full real vocabulary.
  Lesson recorded: verify column names against migrations, not types-regex.

### 2026-07-14 — 0116: feed_items kind check widened (second latent 0111 blocker)
- 0010 pinned feed_items.kind to ('announcement','news','result','update'); 0111/0112 added
  nine emitter kinds without touching the check → every automated emission violated
  feed_items_kind_check. Caught by the seed immediately after 0115 (the errors surface one
  at a time: first the arbiter, then the row constraint). 0116 recreates the check with the
  complete vocabulary (4 curated + 7 from 0111 + 2 from 0112). KIND_WEIGHT keys verified
  against the list.

### 2026-07-14 — 0115: feed_emit ON CONFLICT vs partial index (latent 0111 bug)
- The dev seed surfaced 42P10: `on conflict (dedupe_key)` cannot infer the PARTIAL unique
  index `feed_items_dedupe_idx (... where dedupe_key is not null)` — Postgres requires the
  arbiter to repeat the index predicate. Latent in every feed emitter since 0111; never hit
  in prod only because no profiles insert/home_zip update had fired feed_on_profile yet
  (invite-only beta, no new signups). 0115 replaces feed_emit with
  `on conflict (dedupe_key) where dedupe_key is not null do nothing`. Seed is unchanged —
  run 0115, then dev-seed.sql (the failed run rolled back atomically).

### 2026-07-14 — Dev seed system · Play court filter
- **supabase/seed/** (outside the migration chain): dev-seed.sql populates 4 seed members
  (reserved UUID range 1111…01-04, no passwords — display-only), 2 health pros + 2 coaches
  with headlines/pricing/sports, 5 named cross-reviews, 3 classes (free clinic · paid group
  · private at Mar Vista/Penmar) with future sessions and 4 enrollments (clinic shows
  "2 spots left"). Idempotent (on conflict). dev-seed-cleanup.sql removes every row by the
  reserved UUIDs **plus trigger side-effects** (feed_items by actor) — one script, total
  cleanup. Defaulted vocab columns (format/availability on providers, recurrence on
  classes) intentionally omitted to ride DB defaults.
- **Play court filter**: server URL-param (?court=) beside ?sport=; options derived from
  the live open-match set with counts (a court with zero matches never appears), sorted by
  volume; sport pills and court rows preserve each other's params; filtered empty state
  names the court and offers "Show all courts →". New server-safe **FacetLink** joins the
  filter system (FacetRow visuals, Link navigation).

### 2026-07-14 — Classes & Coaching brought to Training Room parity
- Research (CoachUp/TeachMe.To — the coaching-marketplace standard): table-stakes are
  filters by sport/format(private·group·clinic)/level/price/schedule, coach attribution +
  ratings on listings, transparent per-session pricing; Klimr's registry-checked
  credentials beat their vetting story and the copy now says so.
- **components/classes-browser.tsx**: the FilterGroup/FacetRow deck tuned for coaching —
  Sport (multi-check), Format (radio, from live data), Level (Beginner→Expert vs
  level_min/max), Starts (week/month vs next session), Price (Free/Paid + Min–Max $ on
  cents), search matching coaches and venues. Cards gain "with {coach}" attribution, level
  chip, live seats ("3 spots left", ≤2 = flame urgency, 0 = "Full — waitlist") from
  capacity minus non-cancelled enrollments, next session, location.
- **Page parity**: hero subcopy sharpened; provider CTA wears the flame; NON-providers get
  "Offer coaching" → /settings/professional; coaches section gains the Training Room header
  grammar (kicker + credential/named-reviews subcopy) and a dashed "be the first" apply
  state. No library section by design (health-only). Clock passed as nowMs (purity rule).

### 2026-07-14 — Legal hardening: full protective Terms + complete CCPA privacy set
- Research-grounded on Meetup's terms (the closest comparable: arbitration + class waiver,
  release, 1-year time bar, no obligation in member disputes), arbitration-enforceability
  case law (conspicuous, explains rights given up, small-claims + IP carve-outs, consumer
  venue, opt-out window), and CCPA-litigation trends (incomplete disclosures targeted).
- **Terms grew 10 → 17 sections**: Assumption of risk & release (caps notice, §1542 waiver),
  no-background-checks disclosure, independent-provider + point-in-time credential + NOT
  medical advice, marketplace P2P disclaimer, IP + DMCA notice path + repeat-infringer,
  survival, AS-IS warranty disclaimer (caps), liability cap (greater of $100 / 12-mo
  payments), indemnification, informal-resolution → AAA individual arbitration + jury/class
  waiver + 30-day opt-out + 1-year bar + public-injunctive carve-out, CA governing law +
  severability/assignment/entire-agreement/force-majeure, material-change re-acceptance.
- **Privacy additions**: Retention, essential-cookies-only (no replay/ad-tech — CIPA-aware),
  full CCPA rights block (know/access/portable/correct/delete/opt-out-n/a/limit-sensitive/
  non-discrimination, verification, authorized agents, GPC-n/a rationale), International.
- Date bumped to July 14, 2026. Reply advises real attorney review before go-live (not legal
  advice).

### 2026-07-14 — Privacy assurance: point-of-collection notice + CPRA phrasing
- Research: the statutory formulation is "sell **or share**" (CPRA expanded "sell" to cover
  cross-context behavioral advertising); a business that doesn't sell/share needn't post the
  opt-out link but MUST state the position clearly in its privacy policy. Klimr's policy
  already said "never sell" — upgraded to "never sell or share," with the CCPA definition of
  "share" named and the service-provider disclosure clause kept accurate (processors like
  hosting/email are disclosures, not sales).
- The onboarding wizard gains a persistent point-of-collection notice above the error region
  (ShieldCheck + "Klimr does not sell or share your personal information… used solely to
  operate your Klimr profile and connect you with players" + Privacy Policy link, new tab) —
  legal in substance, calm in tone, sitting exactly where DOB/gender hesitation happens.

### 2026-07-14 — Onboarding wizard: accumulator redesign + hero sports step
- Research-grounded (Duolingo gamified steps/visible progress; review steps catch errors
  pre-submit; motivational framing over configuration; mobile-first): the wizard keeps its
  proven 5-step machine + validation + saveProfile contract and gains:
  **(1) Accumulating summary stack** — each completed step collapses into a parchment
  read-only card (#F7F2E4) above the active one: mono "0N · STEP" label ON the border,
  **Edit chip straddling the border top-right** (Gabriel's sketch), compact per-step content
  (name·ZIP·DOB line, sport chips w/ level+★, style, availability windows, hue dot + bio).
  Edit reopens that step; Next then jumps past still-done steps straight to Review.
  **(2) Step 6 "Review & confirm"** — headline "Everything look right?", all cards above,
  flame gradient submit; guard already keyed to last index so Enter-submit stays blocked.
  **(3) Hero sports step** — tiles: 48px tinted emoji medallions (SPORT_TINT per sport),
  16px bold names, border-2 selection w/ tint gradient wash + lift + 24px check badge; the
  existing in-tile config (level w/ blurbs, rating, format, hand, primary ★) kept intact.
  **(4) Motion + copy** — wiz-in/sum-in keyframes (globals), per-step display headlines
  ("What do you play?"), flame progress bar. Competitor field-comparison verdict: Klimr
  already collects more than typical (per-sport skill/format/hand, availability, DOB) — no
  new fields; presentation was the gap. isEdit mode = all cards pre-done, jump-to-review.

### 2026-07-14 — Sign-in link: explicit 15-minute expiry
- Email copy in supabase/email-templates/magic-link.html now says "expires in 15 minutes
  and can be used once" (was "expires soon"). The template is the in-repo source of truth
  but is APPLIED in the Supabase dashboard — Gabriel pastes it under Authentication → Email
  Templates → Magic Link, and sets Authentication → Providers → Email → **Email OTP
  expiration = 900 seconds** so the copy states the actual behavior (default was 3600s).

### 2026-07-14 — Phone menu: pill grid → right-edge drawer · shared nav module
- The ☰ now opens a **right-edge drawer** (302px, ≤86vw) that slides over the page in 200ms
  with a scrim — the desktop rail's anatomy (list rows, mono kickers, 3px flame active
  indicator) with none of its footprint. Header: avatar + name + X; body scrolls; footer:
  Admin (role-gated), My profile, Account, Settings, Invite (Soon), Sign out. Every row,
  the scrim, the X, and Escape close it; body scroll locks while open. z-[58]/[59] tops the
  bars and the rail.
- **lib/nav.ts** now owns NAV_GROUPS + NavItem; both the desktop rail and the drawer render
  from it — the two menus structurally cannot drift. side-nav's local GROUPS deleted, its
  lucide import pruned to its own needs.

### 2026-07-14 — Tablet rail v2: overlay expansion · footer link fix
- **Overlay mode (≤1180px)**: the rail's flow width is pinned at 76px; the chevron expands
  the CARD as a 234px overlay above the page (shadow-e3, z-10 in the z-[45] aside) instead
  of reflowing content. Transient by design: any nav click, outside mousedown, or Escape
  collapses it — the page never readjusts on tablets. Desktop (>1180) keeps the in-flow rail
  with the persisted choice. The chevron now lives inside the card (static branch explicitly
  `relative`) so it rides the card's edge in both states without jumping.
- **Footer bug**: "My profile" was a hand-written Link that skipped renderLink and wrapped
  to two lines when collapsed — now carries the same collapsed grammar (centered icon,
  sr-only label, title tooltip, closeOverlay on click).

### 2026-07-14 — Rail/TopBar seam: stacking fix for the edge chevron
- The clipped-chevron sliver: the TopBar's sticky wrapper (z-40, later in DOM, bg-bg strip
  starting at the aside's edge) painted over the button's overhang — sibling stacking
  contexts, not a layout bug. Fix: aside gets **z-[45]** (above the bar strip, below z-50
  modal overlays) and the chevron moves to -right-[11px]/top-9 for comfortable clearance in
  the 22px gutter. The "doesn't blend" perception was this artifact.

### 2026-07-14 — Collapsible rail: icon-only on tablets (iPad fix)
- iPad Air (820px) fell in the ≥768 "desktop" band and got the full 248px rail → cramped
  everything. The rail now **auto-collapses to a 76px icon column under 1180px** (Notion/
  Linear/Gmail pattern), with an **edge chevron** floating on the rail border to expand/
  collapse; the user's choice persists in localStorage and beats the auto-default. Collapsed
  mode: mark-only logo, centered icons with `title` tooltips + sr-only labels, group kickers
  become hairline separators (accordion suspended — all sections reachable), avatar-only
  user pill whose menu escapes rightward (inner card no longer overflow-hidden). Width
  animates 200ms; content reflows with it.

### 2026-07-14 — Facet deck refinements: 5-row threshold · footer slot · price range
- **Scroll threshold**: rows are h-8 (32px); the old max-h-[158px] made five rows overflow by
  2px and summon a useless scrollbar. Now max-h-[176px] — five items always fit clean, the
  scrollbar earns its place at six+.
- **FilterGroup gains a `footer` slot** rendered OUTSIDE the scroll area: inputs never hide
  under a scrollbar. Near-me's City/ZIP + Go (and its error line) moved there.
- **Price range**: Min $ / Max $ inputs in the Price footer refine the radios — best-effort
  dollars parsed from costText, Free = $0, unparsable costs pass (never hide what we can't
  read). Deps wired into the filter memo.

### 2026-07-14 — Filters v3: pills → the facet LIST (Amazon grammar) + real multi-select
- Gabriel's diagnosis was exact: variable-width pills make a ragged cloud no container can
  fix. v3 keeps the fieldset deck and replaces the interior with **uniform facet rows** —
  full-width, h-8, indicator + label + optional mono count — the mature e-commerce sidebar
  pattern. **Checkbox squares = multi-select** (Sport, Type — now genuinely multi: state is
  Set<string>, empty = all, legends grow an "n · Clear" micro-link); **radio circles =
  single-select** (When, Price, Near-me radius) so the indicator itself teaches the
  behavior. Near-me stacks its City/ZIP + Go under a hairline inside its box. Rows scroll
  inside max-h ~4.5 rows — fifty sports, same footprint, always a clean column.
  FacetRow + FilterGroup(trailing) live in components/filter-chips.tsx; ChipButton remains
  for non-facet uses.

### 2026-07-14 — Badge v4 (context-correct placements) · FilterGroup fieldset deck
- **Badge, rethought per context**: overlapping an 18px badge on a 17px glyph covered the
  icon, and ring-surface (pure white) haloed against the #FFFDF8 bars — that's what read
  wrong. v4: **labeled** nav items (desktop top bar) carry the badge TRAILING the label,
  vertically centered (the Discord/Slack labeled-row pattern); **icon-only** sites (mobile
  bell, bottom-nav Chats) keep a corner badge but with corner-clip geometry
  (translate 45%/−40% — covers only the glyph's corner) and the ring matched to the actual
  bar color (#FFFDF8).
- **Filters = the FilterGroup deck** (Gabriel's sketch, built): each facet is a real
  fieldset — rounded container, mono legend sitting ON the border — whose options live in a
  bounded chip cloud (max-h 104px ≈ 3 rows, thin styled scrollbar) so fifty sports never
  change the footprint. Boxes sit side by side (flex weights: Sport 1.5 · Type 1.2 · When 1 ·
  Price 0.7 · Near me 1.4) and wrap into a deck on smaller screens; chips inside use the
  compact size of the ink-selected system. Near-me keeps its radius chips + city/ZIP + Go
  inside its own box. Events is the pilot; this is the sitewide-standard candidate.

### 2026-07-14 — Dependabot: TypeScript majors ignored (TS 7 preview failures)
- Dependabot's "Bump typescript 5.9.3 → 7.0.2" PR fails its Vercel preview by design of the
  ecosystem: @typescript-eslint@8.63 pins `typescript >=4.8.4 <6.1.0`, so the install leaves
  Next unable to load TS ("please install typescript") → exit 1. Production (main, TS ^5) was
  never affected — only that PR branch's preview. Fix: `@dependabot ignore this major
  version` comment on the PR + a permanent `ignore` rule in dependabot.yml for typescript
  semver-major. TS 7 becomes a deliberate migration when typescript-eslint supports it.

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
