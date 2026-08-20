# Klimr — Competitive Research, Page Roadmap & Hero Concepts

*Prepared to decide (a) how wide pages should be, (b) what the "hero" band at the top of every page should be, and (c) what to add to each Main & Explore page. Grounded in research on the apps your players already use.*

---

## 1. The wedge — what makes Klimr different

Every major competitor is **single-sport** and **rating-first**. Klimr is **multi-sport**, **identity-verified**, and **place-first**. That last part is the soul of the product, and it mirrors the single most successful idea in social-sports software:

> **Strava's core insight:** a global leaderboard only motivates the tiny fraction who can realistically place near the top. So Strava broke competition into *thousands of hyper-local "segments"* — and suddenly an average cyclist could be **#1 in their own neighborhood.** "Competitive achievability scales with the user's context, not their absolute ability."

That is *exactly* what Klimr's geographic-zoom rankings do for racquet sports. **"You could be the best in Mar Vista"** is a more powerful hook than "you're a 3.5." Everything below is built to make that hook visible and repeatable.

**Klimr's four advantages over the field:**
1. **One app, five sports** — tennis, pickleball, padel, racquetball, beach volleyball. Cross-sport players (very common: most padel/pickleball players also play tennis) have to juggle 2–3 apps today. *(Beach volleyball replaced golf as the fifth sport when the production app was built.)*
2. **Geographic-zoom rankings** — neighborhood → ZIP → city → metro → region → national. The Strava-segment idea applied to racquet sports.
3. **Verified identity** — a trust/safety moat (your 18+ invite-only beta leans into this). DUPR sells a "reliability score"; Klimr can sell *real verified humans*.
4. **Racquetball white space** — there is no modern consumer app for racquetball. Rankings exist only inside R2 Sports / USA Racquetball, gated behind sanctioned tournaments and paid memberships. Recreational racquetball players have *nowhere* to track skill or find a game. Klimr can own that sport outright.

---

## 2. Competitive landscape

| App | Sport(s) | Rating | Social layer | Booking | What they do best (steal this) |
|---|---|---|---|---|---|
| **UTR Sports** | Tennis + Pickleball | UTR 1–16.5, updates daily | Home feed, follow, **Communities/Groups**, notification bell | No | Level-based **match finder** ("Create Play"), flex leagues, **college pathway**, analytics (rating history, win/loss per match) |
| **DUPR** | Pickleball | DUPR 2–8, **Reliability score** | Feed with **likes/photos**, **digital clubs + club leaderboards** | No | **Reliability/confidence indicator**, club leaderboards, self-report + opponent confirm, 70+ integrations, "universal passport" |
| **Playtomic** | Padel + Tennis (+pickleball) | Elo 1–7 | Chat, follow, communities, **travel mode** | **Yes (16k courts, 2M players)** | **Open matches** (join in one tap), **AI suggestions at your level**, **split payments**, filters (surface/price/indoor) |
| **MATCHi** | Multi-racquet | Self-select 1–10 | Light | Yes | Venue management, memberships, **coach scheduling** |
| **R2 Sports / USA Racquetball** | Racquetball | Sanctioned-only | None | Tournament software | The *only* racquetball ranking infra — and that's the gap Klimr fills |
| **Strava** *(adjacent inspiration)* | Endurance | — | **Kudos**, feed, **clubs**, **challenges**, segments | — | **Hyper-local leaderboards**, **Local Legend** (most efforts in 90 days), badge/trophy cabinet, **sponsored segments ($20k–$200k)** |

**Recurring patterns across all of them** (table stakes Klimr should match or has): match-based dynamic rating, a match finder / open-match board, a social feed with reactions, clubs/communities with leaderboards, follow graph + notifications, events/leagues, a premium tier with analytics + brand discounts.

**Real user complaints to design around** (pulled from app-store reviews): UTR users can't easily track events they've signed up for, search results aren't sorted usefully, and group chat isn't tied to events. Playtomic's level slider is fiddly. → Klimr wins by making *my matches/events* obvious, sorting by relevance + distance, and auto-creating a chat thread per match/event.

---

## 3. Page width recommendation

The pages feel empty partly because the content column is `max-w-5xl` (~1024px) on large desktop monitors, leaving big margins. Your own layout standard is "generous `max-w-6xl`/`7xl`, multi-column where content allows."

**Recommendation:** adopt **`max-w-6xl`** (~1152px) as the standard content width for in-app pages, and use **2–3 column layouts** wherever a page currently shows one stacked column (Invites, Notifications, Network, Discover especially). The hero band (Section 4) spans the **full content width** at the top of every page. This is a small, low-risk change I can apply across all pages in one pass once you've picked a hero direction (so they ship together and stay consistent).

---

## 4. The hero band — three concepts (pick one)

A full-width horizontal band that sits **above the page title** on every Main & Explore page. Same height and shape everywhere (≈150–170px) so the app feels coherent; the *content* can shift slightly per page. All three are useful even with almost no data (important during beta) and all leave room for a tasteful **local-sponsor slot** later, protecting that revenue line.

**Concept A — "Your Local Standing."** The band *is* Klimr's differentiator. A rank medallion on the left ("#— · Mar Vista · Tennis"), the next-rung gap in the middle ("3 wins from Top 10 in 90066") with a tiny rating sparkline, and a primary action on the right ("Log a match → climb"). Zero-data state: *"Play your first match to claim your spot on the Mar Vista ladder."* Per page, the call-to-action adapts (Courts → "Find courts near you") but the identity stays "here's where you stand locally." → *Most on-brand; turns the geo-zoom idea into the emotional centerpiece of every screen.*

**Concept B — "What's next."** A personal-concierge strip that surfaces the single most useful next action right now: your next scheduled match (with court + weather), or a pending invite to answer, or a nearby open match to join, or "you haven't played in 5 days — find a game." Per page it tilts toward that page's domain. → *Most immediately useful; best at eliminating the "empty" feeling because there's always a next step.* (Inspired by Playtomic's open-match nudges + Strava's "what's next.")

**Concept C — "Local scene."** A pulse of the racquet community around you: a row of nearby active players (avatars + level), matches logged near you this week, a trending court, "an open match needs a 4th in Venice." → *Best for network-effect energy and discovery; makes a quiet beta feel alive, and naturally hosts a sponsor slot.* (Inspired by Strava clubs/heatmap + Playtomic communities.)

**The unifying option:** build **one** hero-band component (identical dimensions everywhere) with three *modes*, and pick the mode per page — **Standing** on Rankings/Profile, **What's-next** on Play/Invites/Feed, **Local-scene** on Discover/Courts/Network. You get one consistent shape with the right content per page.

**My recommendation:** **Concept A as the default identity, with B's smart call-to-action baked into the right side.** It's the most Klimr-specific thing we could put on every screen, it's motivating from match zero, and it reinforces the one idea no competitor owns: *local* standing. If you want maximum "this app feels alive" energy during beta, layer in C on the discovery-type pages via the unified component.

---

## 5. Per-page feature roadmap

Each idea tagged with its inspiration → **Klimr twist**. Priorities: **[Now]** small/high-impact, **[Next]** medium, **[Later]** bigger bets.

### MAIN

**My profile** (`/me`)
- Per-sport **rating-history graph** + recent form (last-5 W/L). *(UTR/DUPR analytics → shown per sport with the geo-zoom rank.)* **[Next]**
- **Reliability indicator** on each sport ("signal strength" from match count + recency). *(DUPR reliability → paired with your verified-identity badge for double trust.)* **[Next]**
- **Achievement cabinet** — First Match, Win Streak, Zone Climber, Verified, All-Four-Sports. *(Strava trophy cabinet.)* **[Next]**
- Shareable **"racquet passport"** card for texting/social. *(DUPR passport → one card, four sports, your local ranks.)* **[Later]**
- Head-to-head records vs frequent opponents. **[Later]**

**Feed**
- Match-result cards with **reactions/kudos + comments**; auto-posts for rank-ups and badges. *(DUPR likes + Strava kudos.)* **[Now]**
- Tabs: **Following** vs **Near you**. *(UTR home feed + local twist.)* **[Next]**
- Photo/short-clip attachments on results. *(DUPR media.)* **[Later]**

**Chats**
- **Auto match/event thread** — every match and event gets its own group chat. *(Directly fixes UTR's #1 complaint.)* **[Next]**
- Templated "wanna play?" openers. **[Now]**

**Notifications**
- **Rank-change alerts** ("you slipped to #4 in 90066"), nearby open-match alerts, challenge progress, friend-joined. **[Next]**
- Weekly **"your week in racquet"** recap. *(Strava weekly digest.)* **[Later]**

**Network**
- **Players-near-you** discovery: level + distance + sport, follow/invite inline. *(Playtomic player search.)* **[Next]**
- "People you've played" + "players your friends know" suggestions. **[Next]**
- **Rivals** section (most-played opponents + head-to-head). **[Later]**

**Invites** *(your screenshot — the emptiest page)*
- Empty state should **bootstrap**: show "nearby players to invite" + "open matches looking for players you can join." *(Turns a dead end into a starting point.)* **[Now]**
- **Invite via link / QR code.** *(Playtomic.)* **[Next]**
- Sent-invites with a **nudge/reminder** button. **[Now]**

**Play**
- **Open-matches board** — join in one tap, filter by sport/level/distance/time. *(Playtomic open matches → the single biggest engagement feature to add.)* **[Next]**
- **Score entry + opponent confirmation** feeding the rankings. *(DUPR self-report + confirm.)* **[Next]**
- Recurring matches (you already have recurrence plumbing). **[Now]**
- Lightweight **split court-fee** tracker. *(Playtomic.)* **[Later]**

**Discover**
- **Personalized recs** — players, courts, events, challenges at your level near you. *(Playtomic AI + UTR personalization.)* **[Next]**
- **Local scene map** — active players, courts, recent matches around you. *(Strava heatmap.)* **[Later]**

**Rankings** *(Phase 3 — the core)*
- **Geo-zoom ladder** per sport with up/down movement arrows and "you vs nearby ranks" gap. **[Next]**
- Filters: age group, gender, level band. *(Strava leaderboard filters.)* **[Next]**
- **"Local Legend" consistency board** (most matches in 90 days) beside the skill ladder — a second way to win that rewards showing up. *(Strava parallel tracks.)* **[Later]**

### EXPLORE

**Challenges**
- Time-bound **individual + group challenges** with badges + public cabinet. *(Strava.)* **[Next]**
- Cross-sport challenges only Klimr can run: "play all five sports this month," "beat someone 0.5 above you." **[Next]**
- **Sponsored challenges** → direct local-sponsor revenue. *(Strava sponsored segments.)* **[Later]**

**Teams**
- **Club model**: roster + **team leaderboard** + team-vs-team ladder. *(DUPR digital clubs + UTR team leagues.)* **[Next]**
- Scheduled team sessions + team chat + shared calendar. *(Strava club runs.)* **[Later]**

**Courts**
- **Reviews + ratings + photos + amenities/surface/indoor** (you're already building reviews). **[Now]**
- **"Who's playing here"** check-ins + "find a game at this court" (check-in plumbing exists). **[Next]**
- **Court Local Legend** ("kings of this court"). *(Strava.)* **[Later]**
- Booking/reservation integration. *(Playtomic — bigger lift; could start as "reserve interest.")* **[Later]**

**Events**
- **Flex leagues**, tournaments, clinics, social events with **clear "my events" tracking**. *(UTR leagues + fixing their tracking complaint.)* **[Next]**
- Event chat thread + RSVP + calendar sync; results feed rankings. **[Next]**

**Marketplace**
- Local **gear** buy/sell/trade. **[Later]**
- **Coach/pro booking.** *(MATCHi/PlayYourCourt.)* **[Later]**
- **Brand discounts** for premium members. *(UTR/DUPR Power partner perks.)* **[Later]**

**Sponsorships**
- **Local-sponsor placements** — sponsor a ladder, a court, a challenge, or a whole zone (this is where the hero-band sponsor slot pays off). **[Next]**
- **Player sponsorship matching** — brands back top local players. **[Later]**

**Resources**
- **"How Klimr rankings work"** explainer + rules + drills + per-sport beginner guides (esp. racquetball, since nothing else teaches casual players). *(UTR/DUPR "how it works" pages build trust and conversions.)* **[Now]**
- Safety & community guidelines (leans into your verified-identity positioning). **[Now]**

---

## 6. What I need from you to proceed

1. **Hero band:** pick **A**, **B**, **C**, or "**A + B blended via the unified component**" (my recommendation). I'll build it and roll it onto every page.
2. **Width:** confirm I should move pages to **`max-w-6xl`** with multi-column layouts. I'll do it in the same pass.
3. Anything from Section 5 you want me to prioritize first (otherwise I'll start with the **[Now]** items most relevant to the hero we choose — likely the Invites bootstrap + Feed reactions + Play open-matches groundwork).

*The cover-photo fix is already done and in the latest zip — independent of all of the above.*

---

## 7. Implementation status — addendum, July 6, 2026

*This document was written June 19 as a planning artifact. Two and a half weeks of building later, most of it shipped — often in evolved form. This addendum records what happened so the analysis above reads as history, not as an open to-do list.*

**Resolved decisions.** Page width went **beyond** the §3 recommendation: the standard is `max-w-page` (80rem, ~1280px) with multi-column layouts, now a durable rule in `docs/DESIGN_DECISIONS.md`. The §4 hero band was **not** adopted as a universal component; its ideas were absorbed where they earn their place (profile standing, tournament-page hero, PYMK "local scene" energy on Network).

**Shipped from §5** (partial list): open-matches board with join requests + recurring matches · score entry with two-sided confirmation feeding rankings · per-match/event chats (the UTR complaint, fixed) · geo-zoom ranking ladders · Network page with connections/follows, **mutual connections, relationship-context chips, and People You May Know** (sports-aware scoring) · invites hub with accept/decline/cancel · courts with verified-player reviews and add-a-court · events with per-sport types + calendar page (month/week/day) · **full tournament lifecycle** (divisions/fees, waitlist, payment proof, logged random draws, schedule, standings/brackets, public page) · teams as clubs with team-vs-team competition (0092) · marketplace + sponsorships (player sponsorships live) · resources → a full **help center** with an AI assistant · notifications with typed kinds. Beyond this doc's scope, the platform also gained: **live court queues with a courtside display**, classes + admin-vetted professional status, a 90-day recovery archive, an admin console, and a support/ticketing system with a third-party helpdesk integration seam.

**Still open from §5** (deliberately): rating-history graphs + achievement cabinet + racquet passport (profile analytics wave) · Feed tabs/user posting with reactions (feed is admin-published for now) · weekly recap digest · rank-change alerts · split court-fee tracking · booking integration · sponsored challenges · brand discounts/premium tier. These are post-launch engagement work, tracked in the handoff's roadmap section.

**Superseded:** nothing in §1–2 (wedge + competitive read) — that analysis still holds and now describes a product that exists.
