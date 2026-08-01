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

### 2026-07-31 — Play cards: court always shown, faces on the card

Gabriel: cards don't show the court (a join-decision fact) and should
show who's already in (the human pull). Recon twist: the card ALREADY
rendered the court via courtMap + placeLabel, and CourtPicker +
createMatch(courtId) exist — the gap is data-side (matches created
without a court pick) plus a conditional row that vanished when both
court and free-text were empty. Fixes: (1) the location line ALWAYS
renders — court name, else free-text, else a muted "Location TBD" — so
the absence is visible instead of silent. (2) FACES: two batched queries
for the whole page (match_participants for visible cards →
profiles id/display_name/avatar_path/avatar_hue; never per-card),
rendered as an overlapping Avatar stack (22px, ring, cap 4, "+N"
overflow) right-aligned on the players line. Column truth: profiles uses
avatar_hue, not hue (typegen caught the guess). Storage URL built the
same way the feed does (avatars bucket getPublicUrl). Staged; build on
Gabriel's word.

### 2026-07-31 — Integrity sprint completed (0161): sizes, subs, notices

The three staged items landed, plus the schema decision they required.
(1) 0161: tournament_divisions.team_size (1–12, null = flexible) — a
Team-size input appears on each division when the event is team-entry.
(2) COMPLETE-ROSTER RULE enforced in signUpTeam: a team registers only
at full strength (roster == team.max_size), and when the division
declares a size it must match the team's size exactly AND the submitted
roster count — three distinct, plain-English rejections. (3) THE
SUBSTITUTION SURFACE didn't exist (recon proved no post-signup roster
writes anywhere) — so substituteRegistrationPlayer was BORN with the
lock: captain-or-staff authority, rosterLockAt(t) enforcement with staff
bypass, substitute must already be a team member, per-event double-entry
guard, atomic swap preserving is_reserve, registrations revalidate. The
snapshot doctrine is now executable code, not just prose. (4) TEAM PAGE
notices: an active-entries card lists each tournament with "Subs until
{date}" or "Roster locked", linking the public page, with the snapshot
doctrine stated inline. DOUBLE-CHECK AUDIT: repo gates green; removed
the settings-editor placeholder artifact and a stray queue console.log;
mid-flight, an aborted batch was caught having silently skipped its
actions half (the count-assert abort saving correctness again) and was
re-applied standalone; saveDivisions' return select was the hidden
fourth place team_size had to flow (state remount source). Build follows.

### 2026-07-31 — Tournament integrity sprint (0160): rosters, dates, auto-points

Gabriel's tournament batch. THE MULTI-ROSTER VERDICT (he asked for
intelligent evaluation of dual rosters + popups): the elegant answer was
already in the schema — tournament_registration_players IS a per-
registration roster SNAPSHOT. Doctrine adopted: the team's living roster
(team_members) is never forked; each tournament entry is its own locked
copy, substitutions happen ON the registration under THAT tournament's
deadline, so overlapping tournaments never conflict and no popup or
"permanent roster" ceremony is needed. SHIPPED: (1) Roster policy —
roster_lock_policy (14d/7d/3d/24h/at_start/custom) + roster_lock_custom
(0160), a new "Roster changes" section in the settings editor right
after Date & location, rosterLockAt() helper in lib/tournament. (2)
Settings editor reorg — Registration window moved directly after Date &
location; Event photos slot now splices in right after Event details
(the left rail derives from the sections array, so it reordered
automatically); Rules & format LEFT the Legal card for Event details,
and both About and Rules are now RichTextEditor (public page renders
rules as sanitized-shape HTML with list/link styling); Legal keeps the
waiver. (3) Save buttons unified — the Section card's pill (a no-pill-
rule violation!) became rounded-[10px], and dirty-gating is INTERNAL and
generic: the existing child onInput/onClickCapture hooks now set dirty,
successful save clears it, and the button renders only when dirty —
zero per-section wiring. (4) Date sanity, three belts: client (save
wrapper validates every patch touching either bound against init),
server (updateTournamentDraft cross-checks stored truth), DB (0160 heals
inverted/missing ends then CHECK ends>=starts). HARNESS ANOMALY,
recorded honestly: the scratch container accepted violating rows despite
a canonical, convalidated CHECK on sane timestamptz columns — five
diagnostics (schema dup? types? relkind? def?) all clean; declared a
container-pg quirk, prod verification on the deploy checklist (belts 1-2
are app-verified green regardless). (5) AUTO-AWARD — awardTournamentPoints
split into awardTournamentPointsCore + a System wrapper;
/api/cron/finalize-tournaments (Vercel cron, vercel.json NEW, daily
06:00 UTC, CRON_SECRET bearer) finalizes+awards anything 72h past
ends_at never finalized; manual award now stamps
results_finalized_at/points_awarded_at; partial index for the due-scan.
(6) Team banner truth: "forming" threshold is the team's FULL size
(max_size), message states tournaments need a complete matching roster.
STAGED NEXT (named): server enforcement of rosterLockAt at the
substitution surfaces (locate the registration-player edit actions),
team-completeness validation in signUpTeam (roster count must equal the
tournament/division team size), and team-page lock notices listing
active registrations. Build held.

### 2026-07-31 — No-matches flash killed; the events umbrella encoded (0159)

Gabriel's screenshot, four defects. (1) THE FLASH: during the 180ms
debounce gap (before setLoading fires) the empty state saw stale-empty
results and flashed "No matches" — a settledFor state now records which
term the results actually answer; the empty state renders ONLY when
settledFor === term and the AI isn't loading/done. Searching states can
lie optimistically; empty states may not. (2) THE UMBRELLA, encoded:
Gabriel defined "events" as including tournaments — now structural in
BOTH layers: quick-path kindHints.has(event) auto-adds tournament (one-
way; "tournaments" stays specific), so browse-intent lists both and the
Santa Monica Open appears; the AI prompt gains EVENT UMBRELLA (query
search_events AND search_tournaments). (3) RAW sport keys
(beach_volleyball) in subtitles: sportMeta(...).name everywhere — browse
subtitles, RPC-path via a prettySport() wrapper at the push site, and
all three AI tool subtitles (events/tournaments/teams). (4) YEARS on
event dates in every layer: browse + AI fmtWhen + 0159 (global_search
re-created from 0154 VERBATIM by deriving the migration from the 0154
file programmatically — single to_char 'Mon DD, YYYY' change, zero
drift risk; harness probe: year_in_subtitle=true). Staged; build held.

### 2026-07-31 — Events sport filter + color map; the entity-criteria doctrine

Three Gabriel items. (1) EVENTS SPORT FILTER existed all along but hid
itself: sportChips derived from LOADED events and the card rendered only
when >1 distinct sport was present — one event, no filter. Now the chips
come from the MEMBER's sports (availableSports prop ← getUserSportKeys,
the sitewide accessor), so the card shows the member's world regardless
of what happens to be loaded (loaded-sports remain the fallback when the
prop is absent). Another surface off the scoping sweep list. (2) EVENTS
MAP: light-v11 → streets-v12, full color, matching the Courts feel. (3)
THE TEAMS SCENARIO ("teams that need two players") generalized into
doctrine: ENTITY CRITERIA — when a request states criteria about
entities, the model MUST return matching entities, never just page
links. search_teams upgraded: open_spots_min arg; select embeds
team_members(count) (typegen lacks the relationship → cast via unknown,
FK real); openings = max_size − members, unknown-cap teams excluded when
openings were requested (can't prove spots); no sport named → the
member's active sports (the rule, everywhere); >6 kept → items end with
a "See all N teams" row linking /teams. Prompt doctrine instructs
structured criteria args + preserving the See-all row last. Tool also
gained the missing deleted_at guard (parity). Verification pre-deploy:
static — types green, filter parity vs pages confirmed by grep, arg
plumbing typechecked; the scenario's runtime behavior rides the same
tool path the harness can't LLM-drive, so the deploy checklist carries
the live probe. Staged; build held.

### 2026-07-31 — Why the AI "wasn't smart": it was blind (status-filter drift)

Gabriel asked the right diagnostic question — model, access, or
implementation? VERDICT WITH RECEIPTS: implementation. The AI events tool
filtered status = 'published' while live Klimr events are status
'active' (events page + actions agree) — the model received an EMPTY
result set for every events query since the tool was written. No model at
any capability level can surface a row it was never shown; the earlier
phrase-ilike bug and this status drift STACKED, which is why fixing
tokenization alone still produced empty AI groups. Fixed: both events
paths (keyword + semantic-broaden) now use in('active','published'). The
audit also caught: (a) a third 'published' belongs to CLASSES where it is
CORRECT — the exact-count assert aborted before touching it (the
abort-pre-write pattern earning its keep); (b) tournaments had NO
status/visibility/cancellation filter at all — RLS capped leakage, but
the tool now applies browse parity (public, not cancelled, ACTIVE_PUBLIC
lifecycle). DOCTRINE, now written into the tool file: AI tool filters
MUST mirror the page queries exactly — an LLM search is precisely as
smart as its retrieval layer, and Haiku's judgment was never the
bottleneck. The deterministic browse-intent path (previous entry) covers
this query class instantly regardless; the AI layer now sees the same
reality it refines. Staged; build held.

### 2026-07-31 — Search browse intent + AI dedupe; sports editor labeled & ordered

Gabriel's two screenshots. (1) DUPLICATE "Events": the deterministic page
hit and the AI's page group both surfaced /events under different section
labels — the earlier "dedupe" was only loading-state guards (owned in
chat). Real fix: aiGroups is now a useMemo that drops every AI item whose
href the deterministic layer (results + page hits) already shows, and
empties vanish — deterministic wins, AI adds only what's novel. (First
attempt used a render-time IIFE; react-hooks/refs rejected it — the memo
is the idiomatic form.) (2) "Events next month" listing NO events: intent
routing stripped the kind word and the date words, leaving zero
informative words, so the matcher fell back to the raw phrase and matched
nothing. A kind word with no keywords is a BROWSE intent — globalSearch
short-circuits: hinted kind + empty condensed → list that kind's upcoming
directly (events active/published from yesterday, soonest-first, 6;
tournaments public, same shape) before touching the text matcher. (3)
SPORTS EDITOR: visible micro-labels on every control (LEVEL / FORMAT —
SINGLES / DOUBLES / {SYSTEM} RATING — OPTIONAL) so a collapsed "Both" is
never opaque; ordering is DELIBERATE and documented — the member's active
sports first (server truth), then A→Z — and STABLE while editing (useMemo
from initial, never live toggles, so rows don't jump mid-edit; the
post-save remount re-sorts on new truth). Staged; build held.

### 2026-07-31 — Home IS the Feed: nav truth, honest promises, real next dates

Gabriel's screenshot exposed two truths at once. (1) THE NAV LIE: lib/nav
line 14 — the sidebar item labeled "Home" pointed at /feed all along,
while an actual dashboard (SignedInHome) lived at "/" reachable only via
the logo click, overlapping My Profile. Consolidated: the nav item now
says FEED; "/" redirects signed-in members to /feed (public marketing
page unchanged for visitors); SignedInHome retired from the signed-in
flow; site-index's "/" dashboard entry replaced by the Feed entry. My
prior "they're different pages" claim was technically true and
experientially wrong — the label made Home=feed for every user. (2) THE
PROMISE PANEL was false advertising after 0157: "Chronological, always —
no algorithm" and "No suggested strangers" replaced with honest ones —
"Ranked for you, honestly" (your sports, your people, recency; no
engagement bait) and "Your sports & your circle" (sport-matched posts
plus everyone you follow). "It ends" and "No ads" stay true. Feed
integrity means the promise card tells the truth about the ranking. (3)
RECURRING DATES: play cards now compute nextOccurrenceMs (weekly /
biweekly / monthly rolled forward past a 2h grace) — the card shows the
NEXT meeting plus "repeats weekly/every 2 weeks/monthly", never the
stale original date, and the list sorts by effective date. (4) SUGGEST-A-
COURT gains a required sports multi-select (chips from lib SPORTS,
validated ⊆ SPORT_KEYS in the action, text[] column added to 0158
idempotently for both ran/unran worlds, chips shown in the admin queue).
Build + zip still HELD.

### 2026-07-31 — Seven-front reliability pass (0158) — staged, build held

Gabriel's screenshot batch. (1) AI SEMANTIC LAYER: search_events now
broadens on a keyword miss — returns the full upcoming list WITH 140-char
descriptions flagged _broad_list, and the prompt's SEMANTIC JUDGMENT
doctrine makes the model select by MEANING (themes/cultures count), so
"brazilian" matches a Brazilian-themed event even with zero word overlap.
Keyword search is an optimization, never a wall. (2) SEARCH SELF-CLEAR:
TopSearch is now a propless wrapper keyed by usePathname() around
TopSearchInner — any navigation remounts it (term + AI state reset, zero
effects, refresh-safe). (3) PLAY RELIABILITY BELT: whatever the PostgREST
wire filter admits, a JS belt drops past non-recurring matches; recurring
matches with a stale scheduled_at display "Recurring" instead of a June
date (the screenshot's Jun 27 card = recurring template). (4) NAV IA
(LinkedIn model): "Your account" menu item DELETED — identity = My
profile, configuration = Settings (the /account route stays reachable via
the Settings hub). Home NOT renamed to Feed: they are different pages
(Home = dashboard; /feed = the ranked social feed) — explained to Gabriel
rather than silently merged. (5) SPORTS SETTINGS, three real bugs: the
page AND the editor each had their own hardcoded 4-sport list (Beach
Volleyball unfindable, growth impossible) — both dead, lib SPORT_KEYS is
the single catalog; the save upsert omitted active:true (re-adding a
removed sport could never re-enable it); no deactivation for unpicked
sports — saveSports now reconciles (picked→active true, others→active
false) and the editor remounts on server truth via
key={JSON.stringify(initial.sports)}, killing the padel-revert ghost.
PLUS 0158 seeds the sports TABLE with the full FIVE-sport lib catalog
(save validation reads that table; it held only the racquet four — a
caught near-miss: the first seed draft invented 3 phantom sports from a
bad grep count; lib/sports.ts is the catalog truth). (6) SUGGEST-A-COURT
REWORKED: the Google-explorer page is replaced by a structured FloatField
form (name/address required; phone/website/maps/notes optional; rate
limit 5/day) into court_suggestions (0158, RLS insert-own/select-own) +
/admin/court-suggestions review queue (status tabs, one-click maps
verification, mark reviewed/rejected) + admin card. Auto-Google coverage
remains the background scan's job. (7) CALENDAR: month chips grey
(opacity-45 grayscale) once the event has ended before today —
startOfDay(now) comparison, render-pure. Build + zip HELD per Gabriel.

### 2026-07-31 — Search made trustworthy: intent routing, word-match, seamless AI

Gabriel's three screenshots, three defects, one demand: avionics-grade
reliability. ROOT CAUSES, each found exactly: (1) "brazilian events next
month" AI-missed a real Aug 16 event because the events tool ran a
PHRASE-ilike ("%brazilian events%") against a title containing only
"Brazilian" — fixed with orTokens(): tokenized OR matching across title
AND description on events/tournaments/marketplace, plus a prompt ACCURACY
DOCTRINE: the model MUST retry with widened dates and without text before
ANY "nothing found", and even then must say what IS upcoming. (2)
"tournaments next month" quick results showed Settings·Profile because
keyword "name" is a SUBSTRING of "tournaMEnts" — substring matching is
structurally dead: pageHits now matches whole typed WORDS against keyword
words (prefix >=3 both ways). Also every word of that query was a stopword
so the condenser fell back to the raw phrase and matched nothing — kind
words now become INTENT instead of noise. (3) courts appearing for
"…events…": deterministic INTENT ROUTING in globalSearch — a KIND_HINTS
table maps type words (events/tournaments/courts/coach/dietitian/…) to
result kinds; hinted queries return ONLY those kinds, and kind+date words
are stripped before the matcher ("beach volleyball events in August" →
kinds:{event}, matcher:"beach volleyball"). THE ARCHITECTURE ANSWER to
"AI should not be secondary": the avionics pattern is a DETERMINISTIC hot
path (instant, provable — primary instruments) with AI as the async
augmenter (advisory layer): natural-language queries (>=3 words or "?",
>=6 chars) auto-run the AI after a 700ms debounce — the Ask row is DELETED
— and its groups render as ordinary sections in the same dropdown (steps
included for how-tos), with a quiet CHECKING EVERYTHING… chip while in
flight; ⌘↵ stays as the manual trigger. Deterministic results never wait
on the model; the model can only add.

### 2026-07-31 —0157 prod failure: mocked from assumption, not from types

Gabriel's prod run of 0157 failed at the bootstrap: post_comments has NO
user_id — the commenter column is AUTHOR_ID (post_likes does use user_id;
the two tables differ). Root cause is the standing 0147-class lesson,
violated again: the scratch mock was written from assumption instead of
reading lib/database.types.ts, so the harness validated against a schema
production doesn't have. Fixed pc.user_id→pc.author_id in the comments
branch; scratch mock renamed to match prod; probes re-green including a
new author-affinity-from-comment probe. 0157 never completed in prod, so
the file was amended in place (an unfinished migration is amendable; a
completed one is reversed forward). Gabriel re-runs the WHOLE corrected
0157 — every statement is idempotent, so it converges whether Supabase's
editor rolled the failed run back fully or left partial state. NEW RULE,
absolute: scratch mocks are written by COPYING column lists out of
database.types.ts, never from memory — the types file IS production.

### 2026-07-31 —0157 prod failure: mocked from assumption, not from types

Gabriel's prod run of 0157 failed at the bootstrap: post_comments has NO
user_id — the commenter column is AUTHOR_ID (post_likes does use user_id;
the two tables differ). Root cause is the standing 0147-class lesson,
violated again: the scratch mock was written from assumption instead of
reading lib/database.types.ts, so the harness validated against a schema
production doesn't have. Fixed pc.user_id→pc.author_id in the comments
branch; scratch mock renamed to match prod; probes re-green including a
new author-affinity-from-comment probe. 0157 never completed in prod, so
the file was amended in place (an unfinished migration is amendable; a
completed one is reversed forward). Gabriel re-runs the WHOLE corrected
0157 — every statement is idempotent, so it converges whether Supabase's
editor rolled the failed run back fully or left partial state. NEW RULE,
absolute: scratch mocks are written by COPYING column lists out of
database.types.ts, never from memory — the types file IS production.

### 2026-07-30 — THE FEED ALGORITHM (0157) + sitewide sport scoping begins

Gabriel's mandate: research how IG/FB/LinkedIn/TikTok rank, build Klimr's
algorithm on those principles, and scope every filter sitewide to the
member's sports. RESEARCH VERDICT (cited in chat): the industry converged
on candidates → per-user scoring → diversity re-rank; IG's Feed weighs
RELATIONSHIP strength above all; TikTok's defining choice is the INTEREST
graph (engagement over follow graph) with an explicit similarity check for
variety. KLIMR'S EDGE: our interest graph is EXPLICIT — player_sports
already holds matches_played/active per sport; nothing inferred from watch
time. THE ENGINE (0157, all set-based/indexed/RLS-governed):
user_sport_affinity (play habits + selection + aces + RSVPs, normalized)
and user_author_affinity (aces given ×1, comments ×2, follows ×1.5,
friendships ×2.5, top-300/user) refreshed NIGHTLY via pg_cron 04:15;
get_ranked_feed(p_scope,p_limit) INVOKER (posts audience-RLS still decides
VISIBILITY, the RPC decides ORDER): 500-candidate window (21d, partial
index) → score = 1.8·recency(36h) + 1.6·sport + graph(2.2/1.2) +
1.4·author + 0.6·ln(1+aces+2·comments) + milestone nudge → −0.35/slot
author-diversity penalty. ELIGIBILITY = sports you play + general posts +
your graph regardless of sport (the IG behavior). HARNESS: stranger's
off-sport post hidden; friend's off-sport post visible; FRIEND'S POST
RANKED #1 over fresher same-sport strangers — relationship dominating,
exactly as researched. Feed page: chronological query replaced by the RPC
(fetch-by-ids preserving rank; audience/type/blocked belts intact).
SPORT SCOPING: lib/user-sports.ts is the single source of truth —
getUserSportKeys/Options, React cache() dedupe (one indexed query per
request, whole RSC tree), player_sports(active) driven, full-list fallback
so zero-sport accounts never brick. WIRED: Play (chips + valid-set), the
Courts finder dropdown (availableSports prop). SWEEP REMAINING (next
session, same accessor pattern): events filters, rankings, discover
players (shared-sport constraint), marketplace, tournament/match create
forms, feed composer chips. HARNESS LESSONS x2: psql multi-statement -c is
ONE transaction (a late error rolls back earlier fixtures); mid-file role
grants + ON_ERROR_STOP abort scratch applies — apply scratch WITHOUT the
stop flag and grep non-role errors instead.

### 2026-07-30 — Retention FINAL: retain indefinitely (0156 reverses 0155)

Gabriel's decision after the cost analysis: scrap purging entirely — a
member's complete history is a permanent product feature, and the math
made the trade obvious (tens of millions of archived rows ≈ single-digit
GB ≈ ~$3/month at Supabase's $0.125/GB past the included 8GB). 0156 is the
reversal, done the professional way: shipped SQL is never rewritten, it's
reversed FORWARD — 0155 stays in the ledger, 0156 unschedules the nightly
cron job (guarded: works whether pg_cron/the job ever existed) and drops
purge_expired_content. The GDPR storage-limitation purpose is documented
in the migration itself: permanent play history is the product basis
(the Strava precedent); ONLY account deletion removes data — and the
pre-existing account-lifecycle purge (30-day archive→recover→delete flow
in admin actions) is explicitly NOT part of this reversal; it's the
mechanism the policy depends on. The 0155 date INDEXES remain — they
serve the admin archive explorer and browse upcoming-filters, not
purging. Code cleanup verified by token: zero purge_expired_content
references anywhere; /admin/expired is now purely the archive explorer
("kept indefinitely — a member's history is permanent"), the admin card
reads "Kept forever", the RPC left the type system. Harness: function
gone, data intact. LESSON from the cleanup grep: assert on the EXACT
token you removed, not a broad word — "purge" also matches the unrelated
account-deletion feature that must survive.

### 2026-07-30 — Retention v2: purge is POLICY, not a button (0155 rewritten)

Gabriel's correction: admins must have NO purge capability — he'd asked how
long to wait before purging AUTOMATICALLY, and the answer is 24 months for
everything, tournaments included. 0155 v2: the manual trigger and its
server action are DELETED; the Admin expired page keeps only informational
dry-run counts ("queued"), with copy stating plainly that no one, admins
included, can trigger or alter a purge from there. AUTOMATION: a pg_cron
job runs purge_expired_content(false) nightly at 03:30 UTC — scheduled in
a defensive DO block that raises a NOTICE (and still succeeds) if pg_cron
isn't enabled, so the migration can never fail on a plan gap. SCHEDULE:
24 months for matches/events/class sessions AND tournaments; the one
carve-out kept from the tax research — tournaments WITH payment records
hold 7 years (financial-record class) and then auto-purge on the same
nightly job. Tournament deletion now cleans 13 child tables via a temp-id
set (registration_players carries tournament_id directly — no join
needed). Harness matrix: 30-month free cup + 8-year paid cup deleted with
ZERO child orphans; 30-month PAID cup survives its 7-year window; fresh
cup untouched. 0154 unchanged.

### 2026-07-30 — Expired content: browse expiry, admin archive, retention law (0155)

Gabriel's screenshot: June/July matches still listed on Play (July 30).
ROOT CAUSE: the matches browse filtered by STATUS only — no date guard;
tournaments trusted status the same way (events already filtered
correctly). COMPETITOR RESEARCH (recorded): Eventbrite's public search
returns upcoming events only — past events leave discovery but remain
reachable to organizers and via direct links; archive pages with
relative-date limits are the CMS norm. Klimr now matches: Play hides
matches whose scheduled_at passed >2h ago (recurring templates and
unscheduled matches always show); tournaments' two public browse queries
require ends_at within 2h grace OR (no end date AND starts within a day);
detail pages and owner/history views untouched. LEGAL RESEARCH (recorded
w/ citations in chat): GDPR Art. 5(1)(e) and CCPA set NO minimum for
activity content — they impose storage LIMITATION with a documented
schedule; fixed minimums exist for financial/tax records (5–7 years).
POLICY (0155, codified in SQL comments): activity content (matches,
events, class sessions) purges 24 MONTHS after its date — generous beyond
the zero legal floor, preserves year-over-year seasons, caps storage;
payment-linked tournaments retained 7 YEARS (tax class), REPORTED never
auto-purged; paymentless tournaments reported for manual decision.
MECHANICS: purge_expired_content(p_dry_run default TRUE), SECURITY
DEFINER, service_role-only, child-row cleanup (invites/participants/
rsvps/occurrences/managers/enrollments), GET DIAGNOSTICS counts; harness:
dry counts w/o deletion, real run deletes exactly the 30-month fixtures,
recurring + recent survive, zero enrollment orphans. ADMIN: /admin/expired
— the archive explorer (type / expired-date range / organizer-name
filters, 100-row pages, links into each item) + retention panel showing
live dry-run counts + an explicit red purge button (superadmin gate).
Indexes added on every date column the explorer filters. PER GABRIEL:
build + zip intentionally HELD this turn — code staged, tsc+eslint green,
migrations delivered for paste; rebuild on his word.

### 2026-07-30 — Search quality pass (0154): stemming, recency, roles + AI hardening

Gabriel's three screenshots, three root causes, all fixed and probe-proven.
(1) QUICK RESULTS listed PAST events and missed the upcoming one, and
'dietitians' couldn't reach 'dietitian': the 'simple' FTS config doesn't
stem. 0154 rebuilds every search_tsv generated column on the 'english'
stemmer (probe: 'volleyball events' finds 'Volleyball event'), adds
provider ROLES to the index via an IMMUTABLE array_to_string wrapper
(array_to_string is only STABLE — the standard generated-column fix; probe:
'dietitians' finds a roles-only dietitian with a null headline), and gives
the events branch an upcoming-only filter with soonest-first tiebreak
(probe: the Jul clinic hidden, the Aug event returned) while tournaments
order upcoming-first WITHOUT hiding history. (2) QUESTION-SHAPED queries
drowned the AND-matcher in stopwords — the action now condenses queries
with '?' or >4 words to their salient terms for the quick path (the full
question remains Ask-AI's job). (3) THE AI FAILED OUTRIGHT on 'Any
brazilian events next month?': hardened with max_tokens 1400→2000, ONE
corrective retry round when the final answer isn't parseable JSON, and
console.error breadcrumbs for API status/body — failures are now visible
in Vercel logs instead of silent. Plus the QUALITY BAR Gabriel set for
results shape: the system prompt now instructs hub 'Explore' groups (via
find_pages) whenever results belong to a hub — dietitian answers end with
the Health & Nutrition page — and precise relative-date resolution. Site
index vocabulary enriched (dietitian/physio/athletic trainer/mental
performance…). HARNESS NOTE: probe fixtures vanished once between psql
sessions mid-diagnosis; fixtures+probes now always run in ONE atomic
session — a pattern worth keeping.

### 2026-07-30 — The search ENGINE (0153): self-indexing Postgres FTS under RLS

Gabriel's mandate after Live Queue: research the most advanced, reliable
way to keep the whole site indexed automatically. THE RESEARCH VERDICT,
recorded: external engines (Algolia/Typesense/Elastic) index data OUTSIDE
Postgres and would force re-implementing RLS as app-layer filter tokens —
the exact security class Klimr bans; a vendor, a sync pipeline, and a
visibility footgun. The professional fit is Postgres's OWN engine, which is
also Supabase's recommendation: tsvector GENERATED COLUMNS — the index
maintains ITSELF on every insert/update, no triggers, no jobs, forever
("keeps our site indexed automatically", literally) — GIN indexes for
millions-of-rows scale, pg_trgm for typo tolerance ('chevoit hills' finds
Cheviot Hills, probe-verified), and ONE global_search RPC with INVOKER
rights so every branch runs as the caller under RLS. Eight kinds in one
round trip (players, courts[is_active,!private], teams, events, tournaments,
listings[active], classes[published], providers[approved]), blended
ts_rank+similarity ranking, prefix matching, per-kind caps. The app's
globalSearch collapsed from four parallel ilike queries + emitters into one
RPC call + a player hydration pass (avatars/location/account screen/block
screen preserved; provider results map into Classes & coaching, href
/profile). PAGES: the duplicate hand list that forgot Live Queue is DEAD —
top-search's PAGES now derives from lib/site-index.ts (sections annotated
there, keyword-aware matching), so a page declared once is findable in
quick search, the AI's find_pages, everywhere. FUTURE TABLE CONTRACT: one
generated column + two indexes + one UNION branch. Auto-index probe:
generated column populated on bare INSERT with zero application code.

### 2026-07-30 — The full taxonomy: every page sectioned, every kind emitted

Gabriel ratified the deterministic-sections pattern and asked to categorize
EVERYTHING now so future features slot into an established taxonomy. Two
halves, because categories must not be empty theater: (1) PAGES gained an
explicit section field mirroring the side-nav's own groups — primary
(Navigate), compete, community, discover, account — replacing the ad-hoc
account-id set; Live Queue was discovered MISSING from the quick-search
page list entirely and added. (2) globalSearch now EMITS the kinds the
taxonomy names: tournaments (→ /e/{code}), active marketplace listings
(with price subtitle), and published classes — same RLS-scoped client,
same wildcard-stripped ilike, capped at 3 each. The SearchResultType union
grew to seven; the typed Record icon maps in BOTH surfaces forced
completion at compile time (Trophy / ShoppingBag / GraduationCap). Final
SECTION_ORDER: Navigate, Compete, Community, Discover, Settings & account,
Players, Courts, Teams, Events, Tournaments, Marketplace, Classes &
coaching — with the "More" net still underneath for anything future. THE
CONTRACT, restated for every future feature: one PAGES line (+section),
optionally one globalSearch emitter + one SECTION_ORDER row, one
site-index line, optionally one registry entry. Four one-liners, total
searchability.

### 2026-07-30 — Sectioned quick results: deterministic by kind, never by AI

Gabriel asked for organized dropdown sections and floated AI-classification
while deferring to industry practice. The research answer is unambiguous:
Linear, GitHub, Notion, Spotlight — every serious typeahead groups results
DETERMINISTICALLY BY SOURCE TYPE. Each result already carries a perfect
category signal (r.type); AI classification would add latency, cost, and
nondeterminism to an interaction that must feel instant. AI stays where
judgment lives (the Ask path); quick results get engineering. Shipped in
top-search: a SECTION_ORDER table — fixed order (Pages & features,
Settings & account, Players, Courts, Teams, Events), per-section caps,
kicker headers — with pages split into features vs account by id set, and
a visible "More" catch-all so any FUTURE result type appears labeled
instead of vanishing (the extensibility clause). Keyboard navigation and
aria walk the flattened section list, so arrows/Enter behave exactly as
before across section boundaries. Adding a category later = one line in
SECTION_ORDER.

### 2026-07-30 — AI wired into the bar users actually use + shared panel

Gabriel: "the search bar doesn't seem to have updated." Diagnosis: Klimr
has TWO search surfaces — the inline top-bar search (components/
top-search.tsx, its own dropdown, ⌘K focuses it) and the command palette
(mounted in app-chrome but competing for the same ⌘K). The AI shipped only
into the palette; users live in the inline bar — the feature was invisible.
Fix, drift-proof: the AI affordance is EXTRACTED into one shared module
(components/ai-search-panel.tsx — useAiSearch hook + AiAskRow + AiPanel;
onMouseDown preventDefault so blur can't eat clicks) and wired into the
inline bar: a Sparkles "Ask Klimr AI" row leads every typed dropdown,
⌘/Ctrl+↵ runs it, the panel (summary + steps + grouped links) takes over
the dropdown while answering, and it's bound to the exact term (typing
derives it away — no reset effects). The palette keeps its inline copy and
MIGRATES to the shared pieces on next touch (noted). Also per Gabriel: the
bar is ~50% longer (max-w 290→435, flex-basis 180→270) and the placeholder
now advertises the capability: "Search or ask Klimr AI — players, courts,
anything…". Lesson: shipping a feature into a surface nobody looks at is
indistinguishable from not shipping it — find where the users are FIRST.

### 2026-07-30 — AI search made TOTAL: the registry + the site map

Gabriel's correction: the tool list must cover EVERYTHING — Health &
Nutrition, Sponsorships, Notifications, and any future feature — not a
hand-enumerated set that rots. The architectural answer, two layers:
(1) SEARCH REGISTRY (lib/search-registry.ts) — a declarative spine. Each
domain is one entry: safe columns, RLS-scoped query on the user's client,
server-minted hrefs, and a description. The generic `search_domain` tool
builds its enum + its own description FROM the registry at runtime, so a
new feature becomes searchable by adding ONE entry — zero orchestrator
changes. Shipped domains: feed posts (audience RLS!), sponsorships, region
challenges, and two PERSONAL domains (my_notifications, my_invites) that
return only the caller's own rows. (2) SITE INDEX (lib/site-index.ts) — the
navigational map of every user-facing page with keywords + descriptions,
behind a `find_pages` tool, so "where do I…"/feature questions ALWAYS
resolve to a correct link even for surfaces with no data adapter (Health &
Nutrition, Playbook, Rankings, Settings subpages…). The system prompt's
COVERAGE RULE routes: specialized tool → registry domain → find_pages; a
page link with a pointer beats an empty answer. THE MAINTENANCE CONTRACT,
now written into both files' headers: new feature = one site-index line
(navigation) + optionally one registry entry (data) — nothing else.

### 2026-07-30 — Date guard trigger (0152) + AI-enabled global search

DATE GUARD: an organizer moving an event's start could leave a stale end
date BEFORE it. 0152 fixes it where every write path passes — a BEFORE
trigger on events AND tournaments: when ends_at < starts_at, ends_at snaps
to the start's calendar day keeping its own clock time; if that still lands
earlier (end time before start time), ends_at becomes exactly starts_at.
Harness: shifted-same-day, clamped-to-start, valid-untouched — all green.
(Fresh container this session had NO postgres; installed pg16 rather than
skip the harness rule.)

AI SEARCH (Gabriel's spec): the command palette gains "Ask Klimr AI" — one
natural-language box over the whole platform. THE LOAD-BEARING SECURITY
DECISION: every retrieval tool runs on the REQUESTING USER'S Supabase
client, so Row-Level Security decides visibility. Friends-only locations,
private profiles, hidden listings — enforced by the database, not by prompt
instructions; the model orchestrates over what the user could already see,
and holds no keys. Belt on top: explicit safe column lists per tool, hrefs
minted SERVER-SIDE (the model can only echo tool-returned links; the parser
drops any href not starting with "/"), the user query treated as untrusted
in the system prompt, strict-JSON final shape, 12/min rate limit per user.
Eight tools: events, tournaments, teams, players (open_to_invites ONLY —
matchmaking respects invite privacy; availability {day,start,end}[] matched
in the handler), marketplace (price ceilings), courts (reuses courts_finder
with the user's home zip; "at night" ⇒ lights_required), pros+classes
(class_providers approved + published classes), and a CURATED static help
index (steps + known-good links — guidance can never leak data). Palette
UX: a Sparkles "Ask Klimr AI" row leads typed results (⌘↵ shortcut), a
loading state, then summary + grouped link rows + numbered how-to steps;
the AI panel is BOUND to the query it answered (derived visibility — the
compiler's no-setState-in-effect rule pushed a reset-effect into a cleaner
design). Model: claude-haiku-4-5, tool-use loop capped at 4 rounds.

### 2026-07-30 — Search re-architected to the industry pattern + floating labels

Gabriel's three symptoms shared one architectural cause. (1) Padel: 0 under
"All sports" but 9 when searched directly — because the All-sports scan
covered a hand-picked pair (tennis+pickleball); the direct search triggered
padel's own scan. (2) 15–60-second searches — because ingestion ran
SYNCHRONOUSLY inside the page render: Google search + AI screen + serial
upserts × sports, blocking the response. (3) Racquetball/Westwood empty —
downstream of both. THE FIX is the pattern every serious search product
uses: query-time reads ONLY Klimr's own index (instant); ingestion is
background work. Implementation: the page computes which zip+sports lack a
fresh scan (30-day log), kicks the ingest via Next's after() AFTER the
response streams, and returns immediately; the finder shows the existing
navigation transition as a SEARCHING spinner on the Find button + header,
renders an EXPANDING COVERAGE chip when a background scan was kicked, and
auto-refreshes ONCE after 8s to reveal what arrived (the chip clears itself
because the server recomputes staleness). Under All sports the background
scan now covers EVERY sport (log-gated per zip+sport — bounded cost at any
scale). The AI screen already fails open. Repair lesson from the broken
pushUrl patch: the finder ALREADY owned a navigation transition — regex
wrapped a wrapper and shattered syntax; read the surrounding mechanism
before adding a parallel one. FLOATING LABELS: Apple-pattern field family
(components/float-field.tsx — FloatInput/FloatTextarea/FloatSelect) in pure
CSS (placeholder-shown peers, no state): resting label at value size inside
the field; floats to 10.5px on focus/filled; selects permanently floated;
Klimr skin (r10, brand focus ring). Settings→Profile converted as the
flagship; this is the platform standard for future forms.

### 2026-07-30 — Gap-fill scan shipped broken: wrong id contract + cache poisoning

The screening gate worked exactly as designed and exposed the truth: the
table held only TWO Google-backed courts — so a 25-mile All-sports search
returned two results, and the gap-fill scan that should have filled the
area ingested nothing. TWO BUGS, one compounding the other: (1) the scan
read `c.placeId` but CourtResult carries the Google place id in `id` (the
Places mapping sets id: String(p.id)) — every candidate failed the guard
and zero rows ingested; (2) the scan-log was written UNCONDITIONALLY, so
the empty outcome was cached for 30 days per zip+sport Gabriel tried —
retries were silently blocked. Fixes: placeId: c.id with a uuid-shape belt
(never re-ingest table rows); the log is written only for REAL answers
("ok"/"empty") while capped/not_configured/error outcomes retry on the
next search; a console breadcrumb ([courts scan] zip sport status
candidates:N) makes every scan visible in Vercel logs. OPERATIONAL REPAIR
required in prod: `delete from public.courts_scan_log;` to flush the
poisoned rows before re-searching. LESSON, again the same shape as the
0147 drift: I wrote against an assumed field name instead of the actual
type ten lines up in the same file. Contracts get READ, not remembered.
Note: the "All sports 2" badge is the RESULTS count by design (it read 14
earlier because 14 courts existed) — not a sports-list regression.

### 2026-07-30 — Screening gate (0151): fake courts, stale LIVE, coverage gap-fill + finder polish

Gabriel caught a phantom "Mar Vista Recreation Center" at #1 — wrong pin,
no rating, duplicating the real Google-backed #3. ROOT CAUSE: migrations
0015/0028 hand-seeded courts in early development (approximate coords, no
google_place_id, never player-confirmed). The footnote has always promised
"every listing is confirmed by a Klimr player before it appears" — 0151
finally ENFORCES it in the database: courts.is_active gates the finder;
unscreened rows (no place backing AND no confirmation) are deactivated
platform-wide, killing every phantom and dupe in one comprehensive pass,
not just this zip. STALE LIVE PILL: a never-ended test session lit "1 LIVE
QUEUE NOW"; live now requires activation within 12 hours (RPC + header
count), while busy-history keeps all ages via queue_matches. COVERAGE
GAP-FILL: the reason Westwood Rec (racquetball) was missing is table
coverage, not filtering — the first search for a zip+sport in 30 days now
also scans Google Places and ingests what's missing via the existing
upsert (sports-merge on place_id), logged in courts_scan_log, so holes
close the moment a member searches an area — bounded cost, any scale.
DEFAULTS: the sport filter opens on profiles.primary_sport, not "All
sports". POLISH: card number badges + View-court buttons moved to brand
orange (cards were reading black-and-white against the orange map — noted:
proactively audit color warmth, not just structure); court pages gain a
Courts / {name} breadcrumb with back link; the Mapbox wordmark +
attribution moved to compact form bottom-right (full removal violates
Mapbox ToS — the compliant minimum ships), radius chip raised clear of it,
legend overlap resolved.

### 2026-07-30 — MAP RESOLVED (stale deploy) + the haze root-caused + brand pins

Case closed on the blank map: probe v2's screenshot shows a fully rendering
map — canvas 593×650, display:block, visible, markers:14, tiles + labels +
you-dot all present. The blank-canvas saga was a STALE DEPLOY serving old
bundles; the underlying map had been fixed builds ago. The build-identity
header earns permanent-fixture status. Aesthetic pass on Gabriel's notes:
(1) THE "HAZY OVERLAY" root cause — the radius halo's 8%-opacity orange
FILL covered essentially the whole viewport at city-scale radii, washing
every color into flat beige. The fill layer is deleted; the halo is now the
dashed ring alone, and the palette reads true. (2) PINS are brand orange
(#FF4E1B, the --color-brand token) with white ring + white number — no
more black teardrops; the legend's COURT dot follows. (3) Palette enriched
for "clear and in color": water #BFD9EE / waterway #A9C9E4, parks #DCE8CB,
land #F6F1E4, buildings #EFE9DA, ALL streets white with highways #F5C98A,
labels #7A7160 on cream halo. Lesson repeated in one line: half this
investigation was a deployment-pipeline illusion — build identity in debug
output is now mandatory practice.

### 2026-07-30 — Probe v2: build-identity marker + three-point geometry + self-heal

Gabriel's next screenshot showed the SAME six lines ending at idle with the
geometry lines absent — impossible on the new bundle (the probe path
guarantees geometry lines or a failure message after idle), therefore
production was still serving the previous build. Lesson worth keeping: when
debugging via user screenshots, the debug output must carry a BUILD
IDENTITY, or a stale deploy silently masquerades as a negative result. The
header now reads "MAP DEBUG v2 (geometry probe)" — one glance at any future
screenshot proves which bundle is live. Also hardened while here: the probe
runs at THREE points (map ready, first idle, t+2.5s) to catch late canvas
collapse, and if the canvas measures degenerate (<10px either axis) it logs
that verdict and immediately attempts self-heal via map.resize(). Deploy
instruction: confirm the v2 header appears, then screenshot.

### 2026-07-30 — The debug panel's paradox: healthy log, blank canvas ⇒ geometry probe

Gabriel's ?mapdebug=1 screenshot delivered the strangest possible answer:
token pk. (public ✓), importing→loaded→constructed→style loaded→map
ready→idle FIRST FULL RENDER COMPLETE in ~650ms, ZERO errors — the map
believes it rendered perfectly, yet the canvas is visually blank AND the
numbered pins (plain DOM elements!) are invisible too. That combination
eliminates network/token/style entirely and leaves one family: CSS/size.
Checked from the sandbox: globals.css has no canvas/mapboxgl rules; both
pane wrappers use the identical hidden/min-[900px]:block pattern and the
LIST pane renders (so variant generation works); the grid columns apply.
Remaining suspects: the canvas at 0×0 (Mapbox fires load/idle happily into
a zero-size canvas), a computed display/visibility surprise, or the
recolored map rendering at such low contrast it reads as blank (though
absent BLACK teardrop markers argue against pure contrast). The idle probe
now logs the conclusive numbers: canvas attribute size vs CSS bounding box,
computed display/visibility/opacity, container clientWidth×Height, whether
map.getContainer() is our ref'd node, and the live marker count. The
container div also gains explicit h-full w-full as a belt. One more
screenshot decides between "canvas is 0×0/invisible → CSS fix" and "canvas
full-size with markers → paint/contrast investigation."

### 2026-07-30 — Map still blank in prod; CSP exonerated; ?mapdebug=1 ships

Round three on the blank courts map — and this time the ABSENCE of the new
error banner is itself the clue: either 'load' fired (map thinks it's fine)
or the failure shape slipped the auth-only filter. Diagnosed what the
sandbox CAN see: the CSP in next.config.ts was written for Mapbox
(worker-src blob:, api.mapbox.com + *.tiles.mapbox.com + events.mapbox.com
in connect-src, img-src data:/blob:) and the legacy map ran under it for
months — CSP exonerated. What ships instead is the end of blind guessing:
(1) EVERY map error now raises the banner (first error, any status/shape) —
a technical banner beats a silent blank, and healthy maps fire none;
(2) lifecycle STAGE tracking (importing library → library loaded → map
constructed → style loaded → map ready → idle/first full render), with the
8s watchdog reporting exactly which stage it stalled at; (3) ?mapdebug=1
renders the full timestamped log ON the map, headed by a token fingerprint
line that states outright whether the token is a public pk. token or not.
The watchdog was also rewritten off the setState-inside-updater antipattern
(readyRef), and the compiler's refs-in-render rule pushed the log into
state where it belongs. Leading production suspects, in order: a secret
sk. token where the browser needs pk. (the debug header names this
instantly), token URL restrictions missing klimr.com/www, or an
extension/network blocking api.mapbox.com. One screenshot of the debug
panel ends the investigation.

### 2026-07-30 — AI-evaluated court facts (0150): inference is not faking

Gabriel's call: when lights/free/court_count are unknown, let AI evaluate
from the court's real evidence. The principle that makes this compatible
with hide-when-null: the rule bans FAKING, not INFERENCE from evidence — so
the evaluator is built conservative and honest. Evidence = Google Place
Details (Places API New: up to 5 review texts, editorial summary, opening
hours — a park open past 20:00 implies lights). Judge = claude-haiku with a
strict-JSON, injection-hardened prompt whose rules DEMAND null on weak
evidence (lights=true needs night-play/lit-courts/late outdoor hours;
free=false needs fees/permits mentioned; court_count only when a number is
stated). Writes are triple-guarded: per-field confidence >= 0.7, ONLY
currently-null columns (a human value is never overwritten; indoor's
not-null default false counts as unknown, and an inferred indoor=true
cascades lights via the existing DB trigger), and every written field lands
in facts_inferred[] with the full verdict + evidence quotes archived in
facts_inference jsonb. Disclosure: the court page's new Court-facts section
marks inferred chips with a spark + tooltip and a one-line explainer.
Triggers: lazy on first court-page view when facts are unknown (7-day
backoff via facts_inferred_at, one model call per court ever in practice) +
an admin "Evaluate facts with AI" button that reports exactly what was
written. Cost bound: cached-by-timestamp, never in list views. Follow-ups
logged: surface the spark marker on finder cards (needs the RPC to return
facts_inferred), and a member confirm/correct flow that clears the inferred
marker per field.

### 2026-07-30 — Courts map rebuilt with VISIBLE failure states + card parity pass

Production round two: the map pane rendered React chrome (controls, legend)
over a completely blank canvas — no tiles, no attribution, meaning the GL
Map never attached or its style/tiles failed auth. Root cause invisible from
the sandbox AND from production (errors went to console.warn only;
attributionControl was even set false, hiding the one signal that proves
attachment). courts-map.tsx is REBUILT clean on the proven skeleton with a
hard rule: A MAP FAILURE MUST BE VISIBLE. Now: attribution on; an on-map
error banner surfaces 401/403/token/style errors with status + message; an
8-second watchdog reports "didn't finish loading — check the Mapbox token's
scopes and URL restrictions" if load never fires; the dynamic-import and
Map-constructor paths each report their own failure. If the canvas is ever
blank again, the screen says WHY — likely candidates in prod: token URL
restrictions not covering klimr.com, or a secret (sk.) token where a public
(pk.) one is required. Everything else preserved: root/inner marker pattern,
per-layer recolor, ref-driven halo redraw on style.load, callout with
pan-into-view. CARD PARITY vs the reference: the number badge is the spec's
dark rounded-SQUARE (we'd shipped a circle), title 14.5/700, card radius 15,
footer gains the spec's wrap rules (social line flex:1 1 130px min-118px
truncate; actions ml-auto so buttons drop to a second row instead of
truncating the line), avatars 22px with −7px overlap and white rings, and
the well gets its exact framing (#FDFBF7 on #EFE9DC, radius 18, gap 10) plus
the slim custom scrollbar. Remaining visual deltas vs the reference sample
(busy bands, player stacks, court counts, lights/free chips) are EMPTY-DATA,
not code — the hide-when-null rule the handoff itself mandates.

### 2026-07-30 — Pin architecture extended to tournaments (0149); every maps surface audited

Gabriel: make the fix work everywhere. Audit of every location surface:
EVENTS ✓ (0146). TOURNAMENTS — the public page (/e/[code] IS the tournament
page) re-resolved the organizer's Maps link on EVERY render (up to 6.5s per
view on a dead link), ignored the stored lat/lng for the pin, and persisted
nothing. Tournaments already had lat/lng columns — but filled from ZIP
CENTROIDS (approximate) or the Places picker (precise), with no record of
which. 0149 adds location_pin_source ('link'|'place'|'zip'|'venue') +
location_pin_at, backfills provenance (place_id ⇒ 'place' final, else
'zip' provisional). Save path (updateTournamentDraft) resolves the link
whenever the location changes: a resolved LINK overwrites the zip centroid;
'place' is equally final; create marks zip provenance. The page reads the
stored pin first and provisional pins heal daily with the same
upgrade-in-place rules as events. The recheck button is generalized
(kind="event"|"tournament") with recheckTournamentPin (owner/admin), source
labels covering all four tiers, and sits under the tournament map for the
owner. CLASSES — audited, no change: Places-picker coordinates only, no URL
field, nothing to resolve. COURTS — geocodes ZIP origins only, unrelated.
The /maps/search/LAT,+LNG parser fix from this morning benefits every
caller automatically since the ladder is shared.

### 2026-07-30 — THE event-pin culprit, caught by the trace: /maps/search/LAT,+LNG

The organizer re-check trace paid off on its first production click. Gabriel's
goo.gl link 302s to `google.com/maps/search/34.021018,+-118.510259?shorturl=1`
— the coordinates were IN THE REDIRECT URL the whole time, in a shape none of
the three parser patterns matched: PATH-based coordinates with a comma-PLUS
separator (a literal '+', which decodeURIComponent never converts — it only
means space in query strings). The walk behaved perfectly: followed the 302,
refused the search-page body per the Hampshire rule, then dropped gold on the
floor. Fix: a fourth pattern in parseLatLngFromMapsUrl for
/maps/(search|dir|place)/LAT,[+ ]LNG with range validation and a boundary
lookahead so place-name searches ("/maps/search/tennis+courts") can't false-
hit. Unit battery includes Gabriel's exact URL. With venue pins provisional
(previous entry), the stored city-centroid pin upgrades to the exact spot on
the next re-check or daily heal. Three blind fixes missed this; one trace
found it — observability beats speculation, every time.

### 2026-07-30 — Event pin: the sticky-venue-pin flaw + traced resolution + organizer re-check

Gabriel: the event map STILL shows the wrong pin. Two findings. (1) THE
CERTAIN BUG — a stored pin blocked all further resolution: the first lazy
heal fell through to the venue rung (city centroid), PERSISTED it, and from
then on the page rendered the stored pin and never retried the link. A
low-quality resolution could permanently defeat a better one. Fix:
venue-tier pins are PROVISIONAL — while a Maps link exists, the page retries
it daily (same 24h backoff) and upgrades in place; only a link-tier pin is
final. Failed re-attempts touch only location_pin_at (no churn of a working
approximate pin). (2) THE UNKNOWN — why link resolution fails on Vercel when
the link works in a browser — cannot be diagnosed from the sandbox (goo.gl
is egress-blocked), so the resolver is now INSTRUMENTED: an optional trace[]
threads through resolveEventPin → mapsPointFromUrl → resolveMapsShortLink
(12 trace points: each hop + status + location, continuation extraction,
final-URL parse, place-text geocode, Hampshire refusals, platform-follow,
abort/timeout). A "Re-check map pin" button in Organizer tools
(creator/admin-gated server action) re-runs the ladder NOW, persists the
result, refreshes the page, and renders the numbered trace — turning "the
map is wrong" into an exact reportable diagnosis. Also: the walk timeout was
raised 4s→6.5s; four seconds shared across six hops + 300KB body reads +
geocoding on a cold serverless function was itself a plausible silent
killer (aborts returned null indistinguishable from a dead link).

### 2026-07-30 — Courts map pin bug root-caused + Daylight recolor hardened + rating promotion

Gabriel's production screenshot: pins piled on the map's left edge (snapping
back after every drag), a stock-looking map, and sparse-feeling cards. Root
causes, all found:

(1) THE PIN BUG — three transform crimes on the marker ROOT element, the one
element Mapbox owns: inline `position:relative` overrode the stylesheet's
`.mapboxgl-marker{position:absolute}` (markers fell into normal flow — the
left-edge pile); `transition:transform` made GL's per-frame translate EASE
(the post-drag drift); and the highlight effect wrote `transform:scale()` to
the root, clobbering GL's translate outright. THE RULE, permanent: the marker
root belongs to Mapbox — width/height/cursor only; every visual (SVG, number,
live dot, hover scale, transitions) lives on an inner absolutely-positioned
wrapper; z-index is the only safe root write.

(2) RECOLOR — one try/catch wrapped the whole layer loop, so the first
incompatible paint property silently aborted every recolor after it; and
RESTYLE had NO water entry at all. Now: per-layer try/catch + water/waterway
entries per the handoff palette.

(3) HALO — addSource raced setStyle on the satellite toggle and layers were
never re-added after style swaps. Now: the persistent style.load handler
redraws BOTH the Daylight recolor and the halo from effect-synced refs
(haloStateRef/satelliteRef), and the halo effect guards on isStyleLoaded().

(4) SPEC GAPS closed: selecting a court pans its pin into view when
off-screen; the callout meta carries {dist} MI · {n} COURTS · ★ {rating};
and Google ratings are PROMOTED to the primary gold-star row when a court
has no member reviews yet ("N GOOGLE REVIEWS"), demoting to the muted G line
only once Klimr reviews exist — a Google-only court no longer looks broken.
Remaining sparsity on cards (busy band, player avatars, court counts) is the
hide-when-null rule working over an empty dataset, not a defect: those fill
as queue history, check-ins, and court_count values accrue.

### 2026-07-30 — Side-nav scrollbar hidden (the affordance already existed) + 0147 chat-paste drift bit production

Two small items with one big lesson. (1) The side nav's scroll-affordance
machinery (moreBelow state, fade gradient, listeners) was fully built — but
the `scrollbar-hidden` class it relied on was never DEFINED anywhere, so the
native scrollbar painted over the design. Fixed with self-contained Tailwind
arbitrary properties on the scroll container ([scrollbar-width:none] +
[&::-webkit-scrollbar]:hidden); no globals touched. Lesson: a class name that
compiles is not a class that exists — grep the definition.
(2) THE DRIFT SHIPPED: the 0147 SQL pasted into chat was the
summary-reconstructed version (s.started_at) rather than the verified repo
file (qm.started_at) — Gabriel ran it and hit the exact error the harness had
caught for 0148. Supabase rolled back cleanly. New rule, absolute: migration
SQL delivered in chat is COPIED FROM THE REPO FILE via cat at reply time,
never re-typed, never from summary.

### 2026-07-29 — Dual ratings on court cards + courtside↔court venue link (0148)

Two refinements on Gabriel's review of the finder. (1) DUAL RATINGS replace
the fallback precedence: cards now show BOTH sources — the Klimr member row
leads (gold star, "N KLIMR REVIEWS") with a muted Google row beneath (G
badge, rating · count). Each row renders only when its count > 0; a court
with neither shows nothing. More information beats an either/or. Sort-by-
rated uses member ?? google. (2) VENUE LINK (0148): court_sessions gains
court_id → courts (the VENUE — deliberately distinct from queue_courts, the
session's internal playing surfaces). Event-spawned sessions INHERIT the
event's court automatically; standalone sessions get a search picker in
setup ("Court / venue (optional)", debounced type-ahead over name/city, chip
with clear). The organizer's explicit pick wins over event inheritance.
Existing sessions backfilled from their events; courts_finder() recreated
with the DIRECT link checked first, event + 0.15mi-proximity inference kept
as fallbacks for old rows. Harness: linked→LIVE, unlinked neighbor→dark,
ended→dark. TWO PROCESS LESSONS, earned the hard way this session: (a) the
scratch harness's court_sessions mock carried a started_at column the real
schema doesn't have (real: activated_at) — 0147 survived only because it
reads queue_matches.started_at, which IS real; mocks must be built from
lib/database.types.ts, never from memory. (b) 0148's RPC was first re-typed
from the session summary and drifted from the repo's 0147 (return-shape
error, wrong signal source); the fix that shipped REBUILDS the function
verbatim from the repo file with a one-line join edit. The repo is the
source of truth; summaries are not.

### 2026-07-29 — Courts finder rebuilt (0147): map-based, DB-first, honest signals

Full rebuild per KLIMR-COURTS-HANDOFF.md. THE SPLIT: /courts is now the
FINDER — it reads ONLY the confirmed courts table; the old Google-search
explorer (which UPSERTS Places results into courts) moved intact to
/courts/suggest as the ingestion flow behind the "Suggest a court" button and
the shield-check promise ("confirmed by a Klimr player before it appears").
Two different jobs, two different pages.

DATA (0147): courts gains indoor (trigger FORCES lights=true — physics),
tri-state lights/free (null = unknown → the chip is HIDDEN, never faked),
court_count, confirmed_at/by. One SECURITY DEFINER RPC, courts_finder(lat,
lng, radius_mi), does the whole read in a single pass: haversine distance,
member-review aggregates (Google ratings kept as FALLBACK when no member
reviews exist — a deliberate deviation from the handoff's member-only rule,
justified because real Google ratings beat an empty star block; precedence
member > Google, and zero-review courts hide the block), live-queue linkage
(court_sessions has no court_id — linked via event_id→events.court_id OR
session center within 0.15 mi), distinct check-in players over 90d with the
3 most recent for the avatar stack, and BUSY derived per the handoff's
percentile spec: 8 weeks of hour-of-week activity, per-slot distribution
including zero-slots, current slot ≥p70 → BUSY, ≤p30 → QUIET, under 12 total
signals → null and the chip is OMITTED. Harness-probed end to end.

UI: two-pane workspace — 596px internally-scrolling well (page height is
constant at any result count) beside a sticky Mapbox map restyled to the
Daylight palette (light-v11 + a style.load recolor pass: water/parks/roads/
labels per §6; tile-label fonts stay Mapbox-served — JetBrains lives in the
HTML overlays, a glyph-server constraint). Numbered teardrop pins match row
badges with two-way hover/selection cross-highlighting; selected callout via
map.project; dashed flame radius halo tweened over 300ms (instant under
reduced-motion); blue you-dot; custom glass controls incl. satellite toggle;
searchable Sport dropdown (the scalable pattern — survives 30 sports);
Venue Any/Outdoor/Indoor with Indoor auto-satisfying Lights (AUTO tag);
zip/radius/sport/venue/lights/free/queue/sort ALL in URL searchParams
(zip+radius reload the server query; the rest narrow client-side). Mobile
<900px: List/Map segmented switch, never both panes half-height. The legacy
explorer got its own minimal legacy-map.tsx (the new map's contract is
finder-specific). React-compiler lessons logged again: selection is DERIVED
from visibility, not synced in an effect; refs read only inside recognized
event handlers; helpers hoisted to module scope. Follow-ups: row
virtualization at scale, court-page confirm/report flow, court_count
backfill UI.

### 2026-07-29 — business_publication flag removed: the Business system ships unconditional

Gabriel's call, hours after the flag-gated Settings card fix: no kill switch
for this surface — the Business system exists like every other feature. All
ten checks removed across eight files: the /business index, /business/new,
the portal layout (which keeps its REAL gate — roster membership), the public
/b/[slug] page, the Settings card (reverted to unconditional), AppShell's
lower-menu membership fetch (always runs now), and the sponsor surfaces on
event/team pages — which keep their own separate `sponsorship_discovery`
flag for the public strips, untouched, while organizer-facing sponsorship
requests are now ungated. Doc comments claiming darkness were rewritten, not
left to lie. The feature_flags ROW is now inert; deleting it is optional
housekeeping. Zero grep hits remain for the key outside generated types.
Design note for the record: dark-launch flags earned their keep during the
multi-deploy build of this system, but carrying one into steady state was
operator overhead Gabriel explicitly didn't want — the activation step
itself (a SQL statement never handed over as a copy-paste block) is what
caused two rounds of 404 confusion. Flags die when the launch ends.

### 2026-07-29 — Pin ladder revised on Gabriel's review; precision setting retired; Business card gated

Three corrections from production review, same day. (1) STREET-ADDRESS RUNG
REMOVED from the pin ladder — Gabriel's call, and the right one: a prose
address in the description may describe a DIFFERENT place (the after-party,
the parking structure), so reading it risks a semantically-wrong pin. The
extractor and its regex are deleted, not just bypassed. The organizer's LINK
is the source of truth. (2) THE ACTUAL SHORT-LINK BUG: Gabriel confirmed the
goo.gl link works in a browser — so the failure is client-differential
serving: browsers get the 302, unfamiliar server agents get a 200
interstitial. resolveMapsShortLink now sends a browser-grade UA
(+accept/accept-language) and, when a SHORT-LINK host answers 200, mines the
HTML for the continuation URL (meta-refresh, JS location hop, canonical,
maps href — verified against all four shapes) and keeps walking. The
Hampshire rule is intact: URLs only from bodies, never coordinates. Ladder:
link coords → expanded short link → Maps LINK in description → geocoded
venue text. (3) LOCATION PRECISION RETIRED hours after shipping —
neighborhood≈city in the launch geography, so the tier control was a setting
nobody needed. Display rule is now flat: other members see CITY, STATE,
period (helper simplified; match-intel keeps neighborhood for SCORING —
locality weight is real signal — but the reason string says "Same
neighborhood" without naming it, and the output field is nulled). 0145's
columns/trigger stay harmlessly dormant; the migration is skippable if not
yet run. Lesson logged: ask before building a privacy TIER when the product
answer might be a single sane default. (4) The Settings "Business accounts"
card rendered unconditionally while /business dark-404s behind
business_publication — a guaranteed dead end. The card is now gated on the
same flag, so the entry point appears only when the feature is live.

### 2026-07-29 — The event pin, definitively (0146) + opt-in description translation

THE PIN. Recurring bug, root-caused at last: Google retired consumer goo.gl
links in 2025, so the resolver's redirect walk correctly refuses the
interstitial junk (the "pin in Hampshire" guards) and fell through to
geocoding the venue text — "Santa Monica, CA" → city-center pin. Every prior
fix tried to resurrect the link; the definitive fix stops depending on it.
Architecture: resolve ONCE, persist, render from storage. events gains
location_lat/lng (+range CHECKs), location_pin_source
('link'|'address'|'venue'|'court'), location_pin_at. The resolution LADDER
(lib/maps-url.ts resolveEventPin): coordinates in the pasted link → resolved
short link → a Maps link inside the description → a STREET ADDRESS extracted
from the description (new extractStreetAddress — suffix-anchored regex,
ZIP-bearing matches win; verified against the real production description:
"772-798 Pacific Coast Hwy, Santa Monica, CA 90403") → geocoded venue text.
Street addresses can't link-rot. createEvent/updateEvent run the ladder at
save and persist; the event page reads the STORED pin first, then the court
coordinate, and lazy-heals older rows on first view (writes the result back;
24h backoff between failed attempts via location_pin_at — no per-render
refetch loops). The edit form's preview now runs the SAME ladder server-side
(resolveEventPinPreview, latest venue/description via an effect-synced ref so
only link changes retrigger) with source-specific copy, and the failure
message finally tells the truth: Google retired old goo.gl links — paste the
full URL or just include the street address. Two lint battles worth
recording: react-hooks/purity bans bare Date.now() in render (module-level
nowMs helper, per house rule) and react-hooks/refs bans ref writes during
render (sync moved into an effect).

TRANSLATION. Non-English descriptions (Klimr's LA community posts in
Portuguese and Spanish) get a DISCREET "Translate to English" button — never
automatic; the original stays one tap away. lib/lang.ts looksNonEnglish is a
conservative dependency-free heuristic (English-stopword ratio +
accented-letter density; <12 words never triggers) — false negatives just
hide the button. translateEventDescription fetches the description
server-side (never trusts client text), calls claude-haiku with an
injection-hardened system prompt (content is data to translate, never
instructions; HTML/URLs/prices preserved verbatim), SANITIZES the model
output through the same sanitizeRichText pipeline as organizer input, and
caches on events.description_en — cleared by updateEvent on every edit, so
one model call per edit, ever. UI: components/event-description.tsx with
Show-original toggle and a mono TRANSLATED BY AI marker.

### 2026-07-29 — Cosmetic-settings audit: notifications enforced, location precision built (0145)

Follow-through on the invite-privacy finding: a full sweep of every user
setting for cosmetic-vs-enforced. ALREADY ENFORCED: show_courts/teams/
tournaments (profile render), who_can_invite (0144), presence, availability,
sports, blocked, profile fields. CONFIRMED COSMETIC (nothing read them): the
four notification toggles, email_digest, and two fields with no UI at all —
profile_visibility and location_precision (hidden inputs only).

Fixes this pass: (1) NOTIFICATIONS ENFORCED at the single seam — lib/notify.ts
gains KIND_PREF mapping every notification kind to its user_preferences toggle
(match_invite/join/confirm → notif_match_invites; ranking →
notif_ranking_changes; region_challenge → notif_region_challenges;
marketplace + sponsorship → notif_marketplace_events). "system" is
deliberately UNMUTABLE (account/safety/moderation notices bypass prefs —
industry standard) and friend_request/accept have no toggle by design. A
missing prefs row = default-on; muted recipients get no row inserted.
(2) LOCATION PRECISION BUILT AS A REAL FEATURE (0145): the existing
value vocabulary honored ('city' | 'neighborhood' | 'zip', default
neighborhood); mirrored to profiles.location_precision by the 0144 sync-trigger
pattern with backfill + CHECK; lib/location-privacy.ts is THE display-rule
module (publicLocationLabel, zipVisible, precisionOf); applied at every
surface that shows another player's location: profile header line, the
matchmaking engine (lib/match-intel.ts masks neighborhood BEFORE scoring so
"Plays in X" reasons can't leak), and the network directory. The feed was
already city-level (compliant at every tier). Rankings stay ZIP-scoped —
the ladder IS the ZIP; precision governs profile display, not competition.
The Privacy section finally gets the missing control (City only /
Neighborhood / Exact ZIP). Harness: sync both directions + CHECK rejection.

Deliberately NOT built: email_digest enforcement (deliverPush is a documented
no-op seam — there is no mailer to gate; the digest is a feature, not a
settings fix) and profile_visibility (dead field, no UI, contradicts the
stated model that verified members are always visible — candidate for
deletion). Both stated to Gabriel rather than silently skipped.

### 2026-07-29 — Audit-trail evidence, composer polish, enforced invite privacy (0143 + 0144)

Three items from Gabriel's production review.

(1) STAFF-ACTION EVIDENCE (0143). The audit log recorded only bare action
strings ("verification:verified · by Gabriel"), losing the WHAT. admin_actions
gains a meta jsonb column and logAdminAction takes a structured snapshot,
written at action time. Enriched: setVerification (subject name/email,
previous→new status, and the verification_handoffs that backed the decision —
ref, started, completed/expired), setAccountStatus (before-state + reason +
suspended_until), reviewProviderApplication (credential type/id/jurisdiction,
verification URL, applicant + reviewer notes, decision). The dashboard's
"Recent staff actions" rows are now buttons opening components/
staff-actions-log.tsx — a client overlay (fixed inset, backdrop, stopPropagation
card) formatting meta into a labelled evidence sheet with a dedicated identity-
handoff list. Rows with no meta (pre-0143) show a graceful "predates structured
capture" note. The page fetch now also resolves target_user_id → name so the
overlay names the subject, not just the actor.

(2) COMPOSER POLISH. The three audience choices were pill-shaped buttons
(retired-pill violation) in a separate row above the type chips, leaving an
awkward stacked layout. Replaced with ONE unified toolbar: the four type chips
left, then ml-auto pushes an audience DROPDOWN (Public / Friends & followers /
Friends only, each with a one-line description + active check) beside the Post
button. Dropdown uses a window-level click-away with stopPropagation on the
trigger so the toggle doesn't self-close. No empty bands, no pills.

(3) "WHO CAN INVITE ME" — NOW ENFORCED (0144). Was cosmetic: the toggle saved
user_preferences.who_can_invite but nothing honored it. Now: a trigger mirrors
it to profiles.open_to_invites (indexed partial index on =false), readable
under existing profile RLS so pickers filter in one predicate. Enforcement is a
BEFORE INSERT trigger on BOTH match_invites and team_invites — triggers bind
the service role too (team invites are created service-side, where RLS wouldn't
catch it), and the same trigger refuses invites across a block in either
direction. App layer: the match picker (play/[id]) and team roster picker both
exclude open_to_invites=false candidates; the public profile (profile/[id])
hides the Challenge button and shows a "Not open for invites" lock chip for
closed users (a challenge is an invite). Harness-verified with the real triggers
installed: closed target refused even on the service path, blocked pair refused
both directions, open target still accepted, flag syncs both ways on toggle.
Standard applied: enforce at the data layer, reflect in the UI, never UI-only.

### 2026-07-21 — Feed security audit + hardening (migration 0142)

Pre-rebuild audit of the entire feed surface at Gabriel's request, with every
finding fixed in the DATABASE first and verified in the harness with a
non-superuser probe under the authenticated role. Confirmed already solid:
all queries are parameterized (supabase-js/PostgREST — no string SQL
anywhere); like/comment WRITES were post_visible()-gated since 0006, so 0140
made them audience-aware automatically; tags policies correctly scoped;
posts insert/update/delete are author-only with the moderation guard
triggers on top; feed components contain zero dangerouslySetInnerHTML (React
auto-escaping everywhere); the classifier keeps user content structurally
separated in the user message with strict JSON-only parsing and
unsure→disallow; bucket mime allow-list excludes SVG (an XSS vector); no
storage UPDATE policy + upsert-off signed slots means an approved photo can
never be swapped for different bytes after moderation; server actions carry
Next's built-in origin check (CSRF). Findings FIXED in 0142: (1) post_likes
was readable using(true) — full-system like enumeration, including activity
on friends-only posts; now gated on post_visible(). (2) Blocks lived only in
page code; now inside the posts RLS policy and post_visible() — a block
hides both parties' posts from each other in both directions, public
included. (3) media_path grafting: "update own post" allowed pointing
media_path at any string, including a path copied from a friend's visible
post, and the renderer would sign it — re-hosting/leak vector closed with a
two-column CHECK pinning media_path to author_id's folder. (4) Composite
(author_id, created_at) indexes on posts and post_comments backing new
app-level rate limits: 15 posts/hr, 60 comments/hr, 30 upload slots/hr.
Also: the page's interpolated .or() filter removed — visibility is now
purely the RLS boundary; classifier system prompt hardened with an explicit
untrusted-content directive against prompt injection. Probe battery (8/8):
block symmetry, third-party unaffected, likes leak closed, friend access
intact, stranger like-INSERT denied by RLS, cross-folder media_path rejected
by the check, own-folder accepted. Honest residuals, stated not hidden:
videos publish on the text gate with a recorded media_unscreened label until
frame sampling exists; signed URLs are shareable for their 1-hour life
(inherent to the pattern); at-rest encryption is platform AES-256 + TLS in
transit — posts/media are deliberately NOT end-to-end encrypted because
server-side moderation requires readability (chats remain E2E); "hack-proof"
is not a property any system has — verified invariants and no silent
failure modes are.

### 2026-07-21 — The vanish, actually solved (migration 0141): author_type reality

Gabriel's diagnostic proved the "vanished" post was APPROVED all along — the
moderation pipeline had worked perfectly. The real culprit: posts.author_type
is 'user' | 'business' with a CHECK constraint (0132, default 'user'); the
value 'member' has never existed. It came from a wrong scratch-harness mock
after the container outage and leaked into two places: the Feed v2 page's
.eq("author_type","member") filter — which therefore matched ZERO rows for
all eternity — and create_match_post()'s insert, which would have violated
the check on its first-ever call. Fixes: the page filter is DROPPED entirely
(every posts row is feed-eligible; moderation + audience RLS govern
visibility, and business-authored posts joining the feed later is a feature,
not a leak), the posts query now surfaces its error to the server log instead
of silently rendering an empty feed, and 0141 recreates the seam with 'user'.
Second landmine defused while re-verifying with the REAL 0006 triggers
installed in the harness: force_moderation_pending bypasses only
current_user = 'service_role', and a SECURITY DEFINER function runs as its
OWNER — owned by postgres, the seam's 'approved' was silently forced back to
'pending'. 0141 therefore transfers ownership to service_role (which also
carries BYPASSRLS in production). Full simulation now passes: approved
survives the trigger, winner snapshot lands, idempotency holds,
non-participants raise. Lesson recorded: never trust a scratch mock's
defaults over the numbered migration that created the column — 0132 was on
disk the whole time.

### 2026-07-21 — Post privacy + honest publish pipeline (migration 0140)

Two production findings from Gabriel's first live post, fixed as one machine.
(1) THE VANISH: createTypedFeedPost could end in rejected (classifier flag OR
classifier failure — fail-closed catch) or stuck-pending (service-role publish
update failing silently), and the composer reset regardless while the page
showed only approved rows — so even the author lost sight of their post. Now:
the action returns { ok, status, error }; the composer resets only on ok and
narrates non-approved outcomes; gate-INFRASTRUCTURE labels (moderation_error,
moderation_unconfigured, image_review) route to PENDING — a broken classifier
must never masquerade as a content verdict; the service-role update result is
checked and logged; and the feed query shows the author their own posts in any
status, wearing IN REVIEW · ONLY YOU or NOT PUBLISHED chips. Photos are now
actually screened (admin download → moderateImage, ≤4.5MB; larger → pending
'image_review'); rejected media is deleted from storage on the spot; videos
publish on the text gate with a recorded 'media_unscreened' label until frame
sampling exists (deliberate, documented launch pragmatism). (2) PRIVACY:
posts.audience ('public' · 'followers' = friends+followers · 'friends'),
ENFORCED IN THE DATABASE per the DB-level-security principle — the "posts
readable" RLS policy and the SECURITY DEFINER post_visible() (which gates
likes/comments/media reads) both restate the full audience rules over the
indexed friendships/follows pair lookups; verified in the harness with a
non-superuser probe holding the authenticated role across six scenarios
(friend/stranger/follower/non-follower/pending-hidden/author-own-pending).
The composer gains a Who-can-see-this selector (rounded rectangles, no
pills); cards carry FRIENDS / FRIENDS+ markers. The 0112 wire trigger now
emits member_post feed_items ONLY for public+approved posts and retracts on
de-approval or audience narrowing. The feed-media bucket flipped PRIVATE:
the page signs URLs per render in one batched admin createSignedUrls call
(1h expiry) — a friends-only photo is no longer one public URL away.

### 2026-07-21 — Feed v2 (migration 0139): the real social feed

The read-only wire is replaced by a chronological social feed built to Gabriel's
Claude-Design handoff (KLIMR-FEED-HANDOFF.md — reference-exact). Posts are now
TYPED: photo, highlight (video), ask, milestone, plain post, and match — with
0139 adding post_type/media_path/media_duration_seconds/milestone/match_summary
to posts, the public feed-media bucket (own-folder RLS, images + clips), and a
30-second clip cap enforced twice (client duration probe + DB check 1..31s).
The composer offers exactly the four research-driven chips; match reports are
NOT composable — they auto-generate via public.create_match_post(), a
SECURITY DEFINER, participant-guarded, idempotent-per-author+match seam that
the future ranked-result confirmation flow calls in one line (result capture
itself is Phase-3 rankings work, so no trigger yet by design). Feed mechanics:
Nearby/Your-circle scopes (circle = accepted friendships; blocks filter),
underline type tabs with live mono count chips, scope+type in the URL, strictly
newest-first, a real caught-up terminator, and the old wire folded into one
compact expandable digest card on the All tab. Actions: Ace (tennis-ball icon,
pop animation, reduced-motion aware, optimistic via togglePostLike), Comments
(lazy flat thread), Share (Send to a chat / Copy link — chats are E2E-encrypted
so v1 copies the link and routes to /chats; a deep in-chat picker is follow-up).
REPOSTS ARE RETIRED from the UI ("No reposts on Klimr — sharing is
person-to-person"); the 0133 tables remain harmlessly. Pill buttons are gone
from the feed per the retired-pill rule — rounded-rectangle geometry throughout.
The next-match hero and ticker left the page (reference-exact layout); the
sidebar carries the altitude flame card, the four-principle promise card,
Happening soon, People you may know, and the single labeled sponsor slot.
TagRequests consent stays on the feed (prop is items=). Dead hero/ticker code
and their queries were purged; eslint is at zero warnings.

### 2026-07-21 — Business portal restructure (no migration): Gabriel's clarified UX model

Course correction from Gabriel, executed in full. The Business system complements the
professionals category and must NOT live in the main Discover menu — the flag-gated
nav item from the audit turn is removed. The model instead: (1) CREATION IN SETTINGS —
the Settings index gains a "Business accounts" card ("Create and manage businesses
linked to your account", Facebook-page style) leading to the existing list+create
flow; (2) THE LOWER MENU IS THE DOORWAY — when business_publication is on, AppShell
fetches the user's memberships (two indexed queries; the typed client can't infer the
hand-written types' empty Relationships for an embedded join, so no join) and SideNav
renders each business name with a Briefcase icon in the lower region beside Admin;
(3) CLICKING OPENS A TRUE PORTAL, like tournaments — app/business/[id]/layout.tsx
replaces the app chrome entirely, mirroring the tournament-workspace contract:
components/business-nav.tsx clones the rail grammar (collapse/overlay, glyph header
with kind/status/tier chips, grouped items, public-page link, back-to-Klimr pill,
mobile exit strip + chip nav) in a deep business green (#08301f gradient) to
distinguish workspaces at a glance. The monolithic manage page split into five portal
pages: Dashboard (draft banner, Listing toggle, Verified-reach milestones), Profile
(edit form), Team (members), Sponsorships (list + withdraw + proposer with the Player
Coming-soon tile), Verification (the Tier-2 three-state machine). Layout guards
flag + membership once; non-members bounce to /b/[slug]. Ops note for the record:
the container died mid-restructure (9 consecutive failures incl. bare echo), rolled
back to end-of-previous-turn, then recovered — every file re-applied verbatim from
conversation, all gates re-run green, portal routes confirmed in the build table.

### 2026-07-21 — Production feedback fix (migration 0138): events use status 'active'

Gabriel's first deploy screenshots caught what the harness could not: the mock's
events.status default was 'published', but PRODUCTION events use 'active' (the live
Happening-soon module's own filter proves it). Three of my new call sites filtered on
'published' — the feed's DiscoverEvents (why the module never rendered), the sponsor
target search, and critically the eligibility predicate inside liveness_run itself,
which made the Event Pulse generator match ZERO real events. App queries corrected;
0138 ships liveness_run v4 = v3 with the single predicate fixed (derived verbatim, one
token changed), safe to run after 0129–0137. The harness mock's default is now
'active' so this drift class can't silently pass again; both liveness suites
re-verified through 0138. Lesson: mocks copy vocabulary from production inserts, not
assumptions. Also from the screenshots, working-as-designed: no Business entry because
business_publication is off — flipping it reveals nav + console + public pages
together; and Gabriel's three professional requests were all rejected, so the 0135
backfill (approved providers only) created no business for him — create at
/business/new post-flip, then approve in /admin/businesses. (This entry also removes
an accidental duplication of the audit entry below — same tool-retry class as the
types incident, caught by the count-assert.)

### 2026-07-21 — Pre-rebuild audit: one security hole, three efficiency fixes, layout + nav alignment

Full sweep of everything since the last rebuild, findings fixed and re-verified.
SECURITY (real): submitTierApplication accepted client-supplied doc paths unvalidated —
a hostile manager could reference another business's storage path and the admin queue
would mint a signed READ url for it. Fixed: every path must start with
`{businessId}/` and contain no `..`; also corrected a misleading comment claiming
signed-URL uploads re-check storage RLS (they're token-authorized — the real security
is the server-side manager check + server-built path, now stated accurately).
EFFICIENCY: admin Event Pulse counted occurrences by selecting EVERY row (O(all
occurrences) — the exact anti-pattern the scale doctrine bans) → nine head-count
queries; business Verified-reach had an await-per-team N+1 → one batched
team_members fetch; admin tier-doc signed URLs were sequential → Promise.all.
CONSISTENCY: the five new business/b pages used an invented container
(px-[30px] pb-16 pt-[22px]) against the codebase-canonical px-5 py-8 sm:py-10 (51
uses) → aligned; the dynamic createAdminClient import → top-level like everywhere
else. NAVIGATION: /admin/liveness had no breadcrumb label → "Event Pulse"; /business
had NO entry point anywhere once its flag flips → AppShell now reads
business_publication server-side and threads showBusiness through AppChrome into
SideNav, which appends a Briefcase "Business" item to Discover only when on — dark
stays dark, flip makes it findable. One self-inflicted bug during the fix itself: a
global GROUPS.map replace made the new groupsFor helper recursive (its own internal
map got rewritten); caught by tsc, repaired with explicit types. VERIFIED CLEAN:
checked-and-fine list includes event_managers readability (proposal notifications
work), all RPC auth paths, RLS-only deletes (withdraw flows), guard/RPC bypass
scoping, and race guards on admin decisions. All eight harness suites re-run fresh —
including 70 against the cascade-fixed 0135 — all passed; repo lint 0, tsc 0,
production build clean. Ready for rebuild on Gabriel's word.

### 2026-07-21 — Self-serve Tier-2 applications (migration 0137) — every plan thread closed

The last deferred item. Migration 0137 mirrors 0051's proven private-storage pattern
exactly: a `business-docs` bucket (private, 10 MB, images+PDF), path convention
<business_id>/<uuid>-<file>, and `can_access_business_docs` (safe-cast SECURITY
DEFINER → is_business_manager) authorizing read/insert/delete by the first path
segment. `business_tier_applications` carries domain, notes, docs jsonb, and a
NOT-NULL terms_accepted_at; an insert trigger enforces eligibility (business active,
not already tier2, 1–8 docs, real domain) and a partial unique index enforces ONE open
application — decided applications free the slot for reapply. No user update policy
exists: decisions are service-role writes only. Harness 80_tierapp_test.sql (with a
minimal storage-schema mock so the bucket DDL executes) passed all rules — and CAUGHT
A REAL 0135 BUG: business deletion tripped the last-owner guard via the member
cascade; fixed at the source (undelivered migration) with a parent-gone check, and
suite 60 re-verified. Console: the tier note became a three-state machine — apply form
(TierApplication: multi-file signed-URL uploads to the private bucket, domain, notes,
the four-point checklist naming documents/domain/brand-kit/terms and the no-money
line, terms checkbox), in-review card with doc count + withdraw, or the plain
explainer when not yet eligible. Admin: application blocks appear inline on business
cards with server-minted 1-hour signed doc links, one-tap "Approve → Sponsor-ready"
(sets tier2 in the same stroke) or Reject with a reason that reaches the owner; the
admin index counts open applications. EVERY THREAD FROM THE PLAN IS NOW CLOSED.

### 2026-07-21 — Team consent + sponsorship discovery surfaces (no migration)

Two of the three deferred items. TEAM SIDE: the team workspace now fetches its
sponsorships in one pass — managers see the SponsorshipRequests consent card (pending
proposals, Approve/Decline through the audited RPC) right under the hero, and when
`sponsorship_discovery` is on everyone sees the SponsorStrip. DISCOVERY: new
components/sponsor-strip.tsx renders "Sponsored by" chips linking to /b/{slug}, with
the tier-2 shield only when earned — active-only (so consented by definition), and
unpublished sponsor businesses can't render because RLS won't resolve them for
visitors: correctness by construction, not by filter. The event page gained the same
strip under the attendance strip, AND its three separate feature_flags reads were
consolidated into one `.in()` fetch feeding a flag map — the attendance strip,
organizer consent card, and sponsor strip all read from it (scale-first: one indexed
query instead of three). Both surfaces are double-gated: business_publication AND
sponsorship_discovery, so discovery can flip independently after businesses go live.
Remaining deferred item: the self-serve Tier-2 application with document upload.

### 2026-07-21 — Milestone-bucket analytics (no migration) — Business phase COMPLETE

Decision 15 rendered. lib/analytics-buckets.ts is the single source: below 100 nothing,
then 100+/500+/1k+/5k+/25k+/50k+/100k+/500k+/1M+ via formatMilestoneBucket (plus
nextMilestone for honest growing-copy). The contract is structural: business-facing
pages compute buckets SERVER-SIDE and ship only strings — exact figures never reach the
client for business views; internal/admin surfaces may show exact later. First surface:
the "Verified reach" card on the business manage page, powered by Event Pulse — for
each ACTIVE sponsorship, event targets sum verified_count over
completed_with_evidence occurrences (court-checked evidence, not claimed impressions)
and team targets use roster size; a headline total bucket, per-sponsorship bucket rows,
sub-100 shows "Growing — milestones appear from 100 verified", and the philosophy line
sits right on the card: "Klimr shows milestones, not raw counts." The JS-side
summation is bounded (2000-occurrence cap) and noted for a future aggregate RPC when
scale asks. With this the BUSINESS ACCOUNTS PHASE IS FEATURE-COMPLETE for v1:
foundation+merge (0135), sponsorship engine (0136), console, admin review queue,
public /b/[slug], proposal flow with organizer consent and the player Coming-soon
surface, and bucketed analytics — all dark behind business_publication. Deferred
within-phase: team-page consent wiring, self-serve tier application with document
upload, sponsorship_discovery surfaces.

### 2026-07-21 — Sponsorship proposal flow (no migration)

The engine gets its hands. Business side (components/sponsorship-proposer.tsx, on the
manage page for owners/managers of sponsor-ready businesses): kind tiles for Event and
Team plus a deliberately disabled PLAYER tile wearing a "Coming soon" pip — decision #6
made visible; the engine underneath already accepts players. Live search
(searchSponsorTargets: published events / undeleted teams, never players), then terms —
label, optional amount ("on record only"), description — and Send. proposeSponsorship
maps every 0136 errcode to human copy (not sponsor-ready, prohibited category,
duplicate, target gone), then notifies every target controller (event creator+managers
or team creator+managers, never the proposer) with "Nothing shows anywhere until you
approve." Pending rows in the Sponsorships card grow a Withdraw (RLS: managers,
pending only). Target side (components/sponsorship-requests.tsx): the event organizer
tools gain a consent card — business name, label, recorded amount, description,
one-tap Approve/Decline through the audited respond_sponsorship RPC — flag-gated with
the rest of the business system; team-page wiring reuses the same component when the
team workspace gets its pass. The recorded-only line appears at BOTH ends of the flow.
Remaining in phase: milestone-bucket analytics.

### 2026-07-21 — Public business page /b/[slug] (no migration)

What the world sees — and what owners preview. RLS does the visibility math for free:
published+active resolves for everyone, unpublished resolves only for members, so the
SAME route is a true preview with a banner ("Only your team can see this page right
now") that also explains the path to public (review, then list). The page: kind kicker,
display-face name, tier badges only when earned (Verified / Sponsor-ready with
ShieldCheck), area, sport chips, headline, prose About, a Contact aside
(website/email/phone), a Manage button for members, and — the part the whole
sponsorship engine was for — "Proud sponsor of": the business's ACTIVE sponsorships
with target names resolved across events, teams, and players, each linking to the
target, footed by the honest line "Every listing here was approved by the sponsored
side" (true by construction: active = consented). Slug metadata strips the uniquing
suffix for the title. The console manage page gains a View-public-page button so
owners bounce between editing and previewing. Flag-gated like the console. Remaining
in phase: sponsorship proposal flow (player target = Coming soon surface) and
milestone-bucket analytics.

### 2026-07-21 — Admin business review queue (no migration)

The switch that turns drafts into businesses. `/admin/businesses` (admin role, matching
the providers-review bar) tabs draft / active / suspended with live counts. Each card:
name, kind chip, tier chip (color-toned), Listed badge, owner linked into the admin
user view, created date, area, sports, declared sponsor category, headline. Controls:
Approve (draft→active), Suspend, Reactivate — all through `reviewBusiness`, service-role
only per the 0135 guard, logAdminAction-attributed, with owner notifications whose copy
matches the moment ("Your business passed review — list it whenever you're ready").
Tier assignment is a separate deliberate form per card: select none/tier1/tier2 + a
review note that lands in the admin log; `setBusinessTier` notifies the owner, and the
tier2 copy says exactly what unlocked ("You're sponsor-ready — proposals and sponsorship
tools"). Manual review is the v1 mechanism by design — the self-serve tier application
with document upload arrives with the document pipeline, mirroring how provider review
worked before IDV. Admin index gains a "Business reviews" card counting drafts,
accented when nonzero. Remaining in phase: public /b/[slug], the sponsorship proposal
flow (player target = "Coming soon" surface), milestone-bucket analytics.

### 2026-07-21 — Business console v1 (no migration; dark behind business_publication)

Three routes, one flag: /business (your memberships with kind/tier/status/role at a
glance + New business), /business/new (kind picker cards, name/headline/area, sport
chips → draft via createBusiness with a uniqued slug; the copy says plainly that drafts
are private and Klimr reviews before go-live), and /business/[id] (manage). The manage
page: owners/managers edit profile fields through a strictly-typed patch action —
verification_level and status aren't even in the type, and the 0135 guard would revert
them anyway; a Listing card with publish/unlist that explains it takes effect only once
review approves; the team roster read-only with "inviting teammates lands here soon";
and a Sponsorships card listing the business's arrangements with recorded amounts and
statuses, plus the honest tier note when not sponsor-ready. Draft businesses get an
awaiting-review banner. Everything 404s while `business_publication` is off — one flag
lights the console and future public pages together, no half-visible states. tsc caught
a Record<string,unknown> vs typed-Update mismatch in the edit action; rewritten as an
explicit Patch type, which is also the safer shape. Next: the admin business review
queue (draft→active + tier2 document review) and the public /b/[slug] page.

### 2026-07-21 — Sponsorship engine (migration 0136): recorded-only, consent-based, category-enforced

Decisions #5/#6/#7/16 in one coherent schema. `sponsorships` records the relationship —
business → event | team | PLAYER (day one, per Gabriel; the surface says Coming soon,
the engine does not wait) — with an optional disclosed amount that is a matter of
record, never a charge. Consent mirrors tag consent: pending until the target's
controller responds via `respond_sponsorship` (event organizer through
_liveness_is_organizer, team creator OR pro-team manager, or the player themself), one
response ever, either party may `end_sponsorship`. The category policy is enforced IN
the database: `sponsorship_categories` seeds the 13+5 list from
lib/sponsorship-categories.ts (service-role-maintained mirror), businesses declare a
category, prohibited refuses at insert with a clean errcode, restricted requires tier2
which is itself the review gate, and sponsoring AT ALL requires an active tier2
business. Direct status writes are guarded (0006 pattern) with a transaction-local
set_config bypass so the SECURITY DEFINER RPCs' own writes pass — the guard-vs-RPC
conflict was one of four defects self-review caught pre-harness (with an OLD-on-INSERT
audit bug, missing pro-team-manager control, and a policy calling a function
authenticated couldn't execute). Every transition lands in `sponsorship_events`
(created/target_response/ended, actor-attributed). Harness 70_sponsorship_test.sql:
all gates, wrong-actor refusal, organizer approve, single response, player
self-decline, guard revert, either-party end, exactly 3 audit rows — ALL PASSED.
Types patched with count-assertions after the earlier double-application incident.

### 2026-07-21 — Business Accounts foundation (migration 0135): the merge

Decision #2 executed. `business_accounts` is the organizational tenant — kinds
professional | venue | shop | club | brand — with slug, owner, brand/contact fields,
sports[]+roles[] (professional capabilities carried straight from providers), and the
no-payments tier vocabulary none|tier1|tier2. `business_members` (owner/manager/staff)
with three database guarantees: creating a business auto-seats its owner (trigger), a
business can never lose its last owner (trigger, errcode-clean), and
verification_level/status move only by the service role — the 0006 moderation-guard
pattern, silently reverting anything else while ordinary edits pass. RLS: published+
active readable by all, members always see their own; drafts creatable by anyone as
themselves; owner/manager update via SECURITY DEFINER `is_business_manager` (no
recursive RLS); member management manager-gated with self-leave and owner rows
trigger-only. THE MERGE: every approved class_provider gets a kind='professional'
business (name from profile, slug uniqued with an id suffix, id_verified/
background_checked → tier1, basic → none, active but UNPUBLISHED), and
`class_providers.business_id` links them — classes keep provider_id, fully
non-breaking. Ships dark twice over: published=false AND the business_publication flag.
Harness-verified (60_business_test.sql) including duplicate-display-name slug safety.
One ops note: the tool retried a types patch mid-flight and double-applied it;
caught by tsc, deduplicated, all gates green. Next slices: sponsorship engine schema
(event/team/player targets, recorded-only), then the business console dark behind the
flag.

### 2026-07-21 — Recap tag consent engine (migration 0134)

Decision #4 implemented end to end: tags are pending until the tagged player approves.
`post_tags` (unique per post+player) with three database guarantees: an insert trigger
refusing self-tags and blocked pairs (0099's is_blocked_pair — SECURITY DEFINER so RLS
users can consult it), a one-response-ever update trigger (pending → approved|declined,
immutable identity fields, responded_at stamped), and RLS where approved tags are public
only where the post is visible while participants always see their own. Only the post
author may tag (insert policy checks authorship); the author may retract anytime.
Harness-verified in 50_tags_test.sql: self-tag/blocked refusals, uniqueness, single
response with timestamp, re-response refused, cascade. Actions: tagPlayersOnPost
(batch ≤8, notifies each — "Your name shows only if you approve"), respondToTag (form
action; approving notifies the tagger), retractTag. Surfaces: a Tag-requests consent
card at the top of the feed (tagged player only, pending only, Approve/Decline one-tap)
and approved names render on Wire post rows as a quiet "With A, B" line. The recap
COMPOSER (picking players from a match) arrives with the recap feature itself; the
consent engine it needs is now complete and launch-ready.

### 2026-07-21 — Seven open decisions RESOLVED (Gabriel) + immediate implementations

Gabriel's verdicts, verbatim intent: (1) reaction name = **Ace** — implemented now: Zap
icon replaces Heart in both the Wire button and FeedPostActions, aria "Ace this post" /
"Undo ace", like-notification copy now "aced your post"; post_likes remains the store.
(2) **Merge** class providers into Business Accounts — shapes the next phase's schema.
(3) Moderation vendor: **Anthropic now, engineered for env-only switch** — lib/moderation
refactored to a provider dispatcher: MODERATION_PROVIDER=openai + OPENAI_API_KEY flips to
a complete OpenAI omni-moderation adapter (text AND images, currently free of charge;
sexual/minors collapses to `csae`), public API unchanged so the switch is zero-code.
(4) Recap tag consent = **pending-until-approved** (engine next). (5) already resolved:
recorded-only money. (6) Player sponsorship: **build the engine launch-ready, defer the
surface** behind a "Coming soon" — player targets go into the sponsorship schema from
day one. (7) Excluded categories: **industry-standard list adopted** — authored as
docs/SPONSORSHIP-CATEGORIES.md + enforceable lib/sponsorship-categories.ts (13
prohibited incl. gambling/betting outright for match-integrity reasons; 5
restricted-with-review incl. alcohol under 18+ conditions), added to the master document
index. (8) **Feed-first** sequencing confirmed — Feed lane is complete, Business
Accounts phase opens now.

### 2026-07-21 — Repost model (migration 0133)

Mechanics shipped; display naming stays open. `posts.repost_of` references the original
with ON DELETE CASCADE (no ghost content), a partial unique index makes one repost per
member per original — so the toggle is deterministic — and a BEFORE INSERT trigger
refuses repost-of-repost, unpublished originals, and missing originals with proper
errcodes. `feed_on_post` v3 (replaces 0112's) emits cards for empty-body reposts too,
carrying repost_of in the payload. All harness-verified in 40_repost_test.sql:
guards, single-card emission with payload, duplicate + depth refusals, and cascade
clearing both the repost and every card. App: `toggleRepost` is one tap — delete own
repost if it exists, else insert (forced pending by 0006) and service-role approve with
no AI pass since there is no new text; original author notified (never self, hour
dedupe). The Wire renders reposts as the reposter's row with a small ↻ from-{name}
monospace marker after the bold name, the ORIGINAL body as the excerpt (page resolves
originals + authors in the same batched block as likes/comments), and a Repeat2 toggle
between the heart and the comment button that lights brand-deep when you've reposted.
Commentary-on-repost is schema-ready (body stays nullable) but has no UI yet — its
moderation path is already defined (new text → AI gate) when we want it.

### 2026-07-21 — Discover surfaces in the feed (no migration)

One source of truth, two placements. `components/discover-modules.tsx` holds the
presentational People-you-may-know and Upcoming-near-you cards; the feed page fetches
once (the 0099 `people_you_may_know` graph RPC at limit 5 — its context line prefers the
strongest social signal available: played-together × count, then mutual connections, then
a shared sport, then area — plus the three soonest published events) and feeds BOTH
placements. Desktop: the modules join the existing aside above the reserved sponsor slot.
Mobile: the Wire's block assembler inserts a compact discover card after every ~10th
content block (cap 4, alternating variants, `lg:hidden` so large screens never see
doubles), counting the card itself so spacing stays even. Day headers don't count toward
the cadence. PYMK avatars resolve through the same public-storage pattern the event page
uses. With this, the decision-independent Feed lane is exhausted except the repost model;
everything else waits on the seven open decisions.

### 2026-07-21 — Admin moderation queue (no migration)

Human review closes the loop the AI gate opened. `/admin/moderation` (support role) shows
posts AND comments in one place, tabbed pending / flagged / rejected with live totals per
tab (both content types combined), author links into the admin user view, the stored AI
labels on each post, and two-button resolution: Publish or Reject. Both actions go
through the service role — the only principal the 0006 guard allows to touch
moderation_status — so publishing here makes the 0112 trigger emit the feed card
automatically, and rejecting an approved item clears it; every decision is
logAdminAction-attributed (`moderation:post:approved` etc.) with the author as target.
The admin index gains a "Moderation queue" card whose count (pending+flagged across both
tables) accents when nonzero. Honest framing in the page copy: the AI pipeline already
publishes or rejects synchronously, so this queue's realistic contents are appeals on
rejections, stragglers stuck pending, and the future `flagged` state (report-driven or
classifier-unsure) — the machinery now exists for all three. breadcrumb-map already
anticipated the route ("moderation: Moderation").

### 2026-07-21 — Comment threads in the Wire (no migration)

The confirmed flat+one-reply shape, visible. `components/post-comments.tsx` renders the
thread under a member post in the Wire: bold-name ledger rows matching the Wire's density
(no avatars — text-first like everything around it), one CornerDownRight-indented reply
level, delete-own on hover, Enter-to-send composer with an explicit replying-to chip.
Threads load LAZILY via `listPostComments` — a proper useEffect fetch (a first draft
fired the load inside render via startTransition; self-caught and moved to an effect
with a liveness guard), so 45 Wire blocks never pay for threads nobody opened, and
`mine` is computed server-side so the client carries no identity. After posting, the
list re-fetches: what you see is exactly what everyone sees, because the moderation
pipeline already ran synchronously. WireLine grows a MessageCircle toggle beside the
heart (same visual grammar, count-when-nonzero); the row wraps in a container only for
posts so the parent divide-y treats row+thread as one unit. The feed page counts
approved comments with the same batched `.in()` pattern as likes (one Promise.all) —
denormalized counter columns for BOTH remain a single future migration when scale asks.

### 2026-07-21 — Feed groundwork (migration 0132): honest publishing, author polymorphism, one-level replies

Decision-independent Feed 2.0 foundations, built on the discovery that the 0006/0112
architecture was already right and merely unwired: DB triggers force every user-client
insert to `pending` and only service_role may change moderation_status, while the 0112
feed trigger emits cards only on `approved` — so member posts were landing pending and
never surfacing. `createFeedPost` now runs the honest pipeline: user-client insert
(pending by trigger), `moderateText` (the existing Anthropic seam in lib/moderation.ts —
CSAE-first policy, fail-open only when unconfigured for text, fail-closed for images),
then service-role publish or reject with labels recorded. Blocked content never surfaces
anywhere by construction. Migration 0132 adds `posts.author_type` ('user' default,
'business' check-ready for either providers-merge outcome) and `post_comments.
parent_comment_id` with a BEFORE INSERT trigger enforcing the confirmed flat+one-reply
shape (nested, cross-post, and orphan parents all refused with proper errcodes; replies
cascade-delete with their root) — harness-verified in 30_feed_test.sql. New actions:
`addPostComment` (same pipeline; friendly pre-validation with the trigger as backstop;
notifies the post author, never self) and `deleteOwnComment` (RLS-scoped). Comment UI
threads land next slice after reading feed-wire internals; the reaction table needs
nothing — post_likes already IS the single-reaction store, only its display name (the
"Ace" decision) is pending.

### 2026-07-21 — Public attendance strip (no migration; behind attendance_strip_public)

The confirmed privacy cutoffs made visible: `components/event-attendance-strip.tsx` renders
"Recent sessions · verified at the court" chips on the event page (just under the hero,
above the RSVP actions) from the last four CLOSED occurrences — completed_with_evidence and
past skipped dates only. Counts follow Gabriel's approved rules exactly via
publicAttendanceLabel: <4 suppressed (chip says just "Played" — play is confirmed, the
number is private), 4–9 renders "5–9 played", ≥10 exact. Empty occurrences are OMITTED —
the strip is proof of life, not a shame ledger. Skipped dates show the organizer's note so
gaps read as intentional ("Skipped — Holiday"). Delayed publish is inherent: only
grace-closed occurrences exist to render. Entirely flag-gated: one PK read of
`attendance_strip_public` (off = seeded default) short-circuits before the occurrence
query, so the feature is built, shipped dark, and lights up on flip with zero deploy.
Event Pulse is now feature-complete for the shadow + nudge phases; remaining GA work
(auto-dormancy on the real column, discovery unlisting) waits on shadow-data review.

### 2026-07-21 — Event Pulse nudges + archive (migration 0131), job v3

Rollout step 2 of shadow→nudge→limited→GA. `liveness_run` v3 (derived programmatically from
v2 + eight verified deltas so nothing drifts) adds: organizer nudges behind the
`event_liveness_nudges` flag, written set-based by the job itself in the same statement as
the series machine — on a transition INTO watch or dormant, the creator and every
event_manager get a kind:'system' notification with deliberately forgiving copy ("skipped
dates never count against you" / "run your next session and it springs right back") linking
to /events/{id}; transitions-only semantics make dedupe structural (re-runs nudge zero).
Archive rule: shadow 'dormant' for ≥6 months with a fresh empty close → shadow 'archived'
(reason dormant_six_months), silent by design (no nudge — the dormant nudge already fired),
dormant_at preserved through the transition, real liveness_status still untouched.
Resurrection stays one session away (streak=0 → active from any state). Verified on the
scratch-Postgres harness: suite 1 fully re-passes under v3 (no regression) and the new
suite proves 2 dormant nudges (creator+manager) + 1 watch nudge with correct copy split,
zero nudges on re-run, and archive with real=active + dormant_at kept + silence.
REASON_LABEL in lib/liveness.ts now covers every code the job and RPCs emit, so the admin
transition log reads in plain English. Flags to flip when Gabriel is ready:
`event_liveness_nudges` (this slice), then `event_liveness_auto_dormancy` (GA — real column).

### 2026-07-21 — Event Pulse organizer tools (migration 0130) + verified job v2

The humane half of liveness. Five SECURITY DEFINER RPCs (execute → authenticated; organizer
check via `_liveness_is_organizer` = creator or event_managers): `liveness_skip_occurrence`
(any future/near date, optional 140-char note, upserts the occurrence row using
`_liveness_occ_bounds` which mirrors the generator's time math; already-closed dates refuse
with `already_closed` BEFORE the past-date guard — test-found precedence fix),
`liveness_unskip_occurrence`, `liveness_pause_series` (≤180 days; immediately skips window
dates 'Paused by organizer'), `liveness_resume_series` (works from paused OR ended —
forgiveness by design; re-schedules future paused-skips and clears stale closed_at), and
`liveness_end_series` (cancels future dates; restartable). `liveness_transitions.actor`
records who did what. `liveness_run` v2 adds: step-0 auto-unpause when `paused_until`
passes, pause-window occurrences close as SKIPPED never empty, ended-series stragglers
cancel, and a simplified audit RETURNING. Verified end-to-end on a scratch Postgres 16
(mock base schema + both migrations + behavioral suite in /home/claude/pg): three strikes
→ shadow dormant with real status untouched, guest walk-ins counted, idempotent re-runs,
stranger refused, closed-guard, pause produces zero empty closes, resume, end+forgiveness,
six attributed audit rows — ALL PASSED. App layer: `upcomingOccurrenceDates()` exported
from lib/event-schedule.ts (client-side mirror of the generator for dates not yet in the
DB), five thin form actions in app/events/actions.ts mapping RPC error codes to human
copy, and `components/event-liveness-panel.tsx` — the organizer "Schedule & liveness"
card on the event page (recurring events only): next six dates with skip/restore + note,
pause-until with server-computed min date (module-level helper per the no-Date.now-in-render
rule), resume, and End-series behind DangerConfirm. Copy tells organizers plainly: skipped
and paused dates never count against the event.

### 2026-07-21 — Event Pulse shadow (migration 0129): occurrences, evidence, three strikes

Liveness ships shadow-first per plan v2. Migration 0129 adds `feature_flags` (seeded with the
full liveness/business/sponsorship flag set; `event_liveness_shadow` on, everything else off),
`event_occurrences` (unique per event+date, occurrence FSM), liveness columns on `events`
(`liveness_status` real vs `liveness_shadow`, `empty_streak`, `last_alive_at`, `organizer_state`,
`paused_until`, rule version), and the append-only `liveness_transitions` audit. One SECURITY
DEFINER job `liveness_run(grace, job_id)` does everything set-based: (1) generates occurrences
for queue-enabled published events by mirroring lib/event-schedule.ts exactly (SU..SA tokens,
Sunday-anchored biweekly, same day-of-month monthly) in America/Los_Angeles — rule v1 documents
the fixed-TZ limitation until events carry a timezone; (2) closes occurrences 18h after end,
tallying evidence from queue truth — `queue_team_members` via `queue_teams.session_id` →
`court_sessions.event_id`, members AND walk-in guests (`'g:'||lower(guest_name)`; no RSVP ever
required — Gabriel), plus match counts for the evidence jsonb; (3) runs the series machine on the
SHADOW column only: three consecutive empties → dormant (monthly also ≥75 quiet days), one empty
→ watch, first two closed occurrences exempt, skipped/cancelled excluded, organizer pause
respected, every change audited with reason codes + job id. `event_liveness_paused` is the outage
circuit breaker (job no-ops). Scope guard: only queue-enabled events are judged — formats that
can't produce evidence are never punished by its absence. Admin → Event Pulse (`/admin/liveness`,
admin role) shows flags, occurrence stats, off-active series, recent transitions, and a Run-now
button (`runLivenessNow` → service-role RPC, admin-action logged). pg_cron scheduling note in the
migration for the Pro upgrade. Constants live in `lib/liveness.ts` (3 strikes, 18h grace, 75d,
exemption count, privacy-safe `publicAttendanceLabel`: <4 suppressed, 4–9 range, ≥10 exact) so
tuning never needs a migration.

### 2026-07-20 — One-line names (marquee), 16-char cap, safer winners-done
- Long names wrapped the Next-up cards to three lines. Every name now renders
  on ONE line via MarqueeText: when it overflows, a courtside marquee holds
  2 s, glides to the end, holds 2 s, glides home — measured in an effect and
  driven by the Web Animations API (no state, no re-renders; short names never
  move). Player names capped at 16 chars, client (maxLength+slice) and server
  (join + full-team paths) — court labels keep 40.
- Up-next meta drops the "· 2m waiting" tail (the join time already says it);
  one line per team, always.
- "Winners are done — call the next two" sat beside Start next match and,
  mispressed, dissolves the winning team — it now requires press-&-hold, via a
  new HoldButton ghost variant that keeps the original quiet outline look:
  soft white fill sweeps only during the press, and the "keep holding"
  caption fades in only while a press is in flight.

### 2026-07-20 — Geofence distances speak the user's units
- "You're 7444m away" → locale-aware, Google-Maps-style formatting via
  lib/queue.ts#formatDistance + prefersImperial (US/LR/MM from Accept-Language,
  read server-side in the join action; every other market gets metric —
  future-proof by default). Imperial: feet under a mile (nearest 50 ≥ 100 ft,
  so the 150 m radius reads "500 ft"), miles with one decimal under 10.
  Metric: meters nearest 10, km past 1000. Settings copy shows both units.

### 2026-07-20 — Kiosk exit done right: top-right, tap teaches, hold shows progress
- Field report: the bottom-right hold-3s ✕ had zero affordance — users tapped
  repeatedly and assumed it was broken (it also crowded the QR panel). Rebuilt
  to the kiosk-industry pattern: chip moves TOP-RIGHT (the universal close
  position); a TAP shows a glass hint capsule ("Hold for 3 seconds to exit",
  auto-dismisses); a HOLD fills an accent progress ring around the chip over
  the full 3 s (onPressingChanged), so the gesture visibly registers and
  releases reset it. Display brand lockup enlarged ~35% (mark 27, logotype to
  clamp 1.35–2.25 rem) for recognition at courtside distance.

### 2026-07-20 — Codes are credentials: crypto RNG, generic samples, Reset codes
- The iPad placeholder (and hub copy) showed a REAL historical code — replaced
  with generic ABC123/ABC1234 everywhere. Generation upgraded from Math.random
  to node:crypto randomInt (31-char alphabet, ~8.9e8 space, unique-indexed with
  retry) — password-grade, non-repeating in practice.
- Organizer "Reset codes" (Session settings, two-step confirm): rotates BOTH
  the join code and the display code in one guarded action. Printed QRs die
  instantly; every open courtside screen self-ejects — the display compares
  the code it was ENTERED with against the session's current display code on
  each poll, and on mismatch shows "Codes were reset" and (in the app) bridges
  back to the setup screen. Leak response is one button.

### 2026-07-20 — Team-name mode: the empty-patch early return was eating it
- updateSessionSettings early-returns when its known-field patch is empty — and
  the teamNameMode handler was bolted on BELOW that return, so a mode-only
  change answered ok while writing nothing (the select snapped back on the next
  poll). The mode is now a first-class patch field beside the others; bolt-on
  removed. Labels refined: "First joined player's name" / "Each player's
  initials".

### 2026-07-20 — Courts are live-editable; the display freezes by derivation
- Add-a-court prefills the real name (Court N, editable; remounts per add so
  numbering stays fresh). Every existing court gains an inline editor (name,
  formation, levels) behind an Edit button — updateCourt validated server-side
  against the sport's formation list.
- Propagation semantics, per Gabriel: name/level edits show on the courtside
  screen within a poll (~seconds), always. A formation change never disturbs a
  RUNNING game because the display derives the live formation from the match's
  own teams (their size is the formation truth) and adopts the court's new
  value the moment the match ends. Freeze-by-DERIVATION, not memory — the
  repo's no-refs-in-render/no-setState-in-effect rules pushed toward the purer
  design. The display's origin read also moved to the useSyncExternalStore
  pattern while in the file.

### 2026-07-20 — Operator/join credential split (0128) + display refinements
- Gabriel's security catch: the public join code doubled as the courtside
  operator code — anyone scanning the poster could open /q/<code>/<n> and
  drive the match controls. court_sessions.display_code (0128, backfilled) is
  now the operator/kiosk credential: shown only in organizer tools + session
  setup, typed into the iPad, resolved by /api/q/validate and /q/<code>/<n>.
  The join code joins; the display code operates. Inserts are 0128-tolerant.
- Display: brand lockup moved to the top-left (was buried by the QR), join URL
  drops the www, match-side team names +30%, "in line since" left-aligns under
  the number chip. Beach volleyball gains 5v5. Add-a-court gains an editable
  name (placeholder Court N). iPad gets a visible discreet exit chip:
  hold 3 s → setup screen (replaces the invisible corner + menu).

### 2026-07-19 — The gate was eating the app's APIs (public-path additions)
- Tablet's "answered unexpectedly" = HTTP 200 with an HTML body: the middleware
  auth gate intercepted /api/q/validate (born this week, never whitelisted) and
  served its page to the app's JSON client. /api/app-diagnostics was equally
  gated — which is why the tablet's own failure reports never landed. Both are
  now PUBLIC_PATHS (they're defensive-by-design: poster-public codes only;
  header-gated clamped ingestion). Standing rule: any endpoint meant for the
  anonymous Courtside device must ship WITH its middleware whitelist entry.

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
