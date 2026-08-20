# Adding a sport to Klimr — the complete contract

Every sport on Klimr is defined **once**, in a small set of registries, and
every page reads from them. Nothing about a sport — its formats, team sizes,
labels, colors, rules — may be hard-coded inside a page. This document is the
full inventory: fill out every section below and the sport works everywhere
(match creation, cards, filters, search, playbook, teams, tournaments).

**Research requirement.** Before filling anything out, verify the sport's
structure against its governing body (the way the current five were):
tennis/pickleball (USTA / USA Pickleball), padel (FIP — doubles is the
standard; 20×6 m singles courts are rare training variants), racquetball
(USA Racquetball Rule 1.1 — singles, doubles, and three-player cutthroat as
the non-tournament pickup game), beach volleyball (FIVB/AVP — 2v2 sanctioned
standard, official 4v4 rules, 3s/4s as rec-league staples). Write the source
into the registry comment.

---

## 1. The canonical registry — `lib/sports.ts` (REQUIRED)

| What | Where | Notes |
| --- | --- | --- |
| Catalog entry | `SPORTS` | `{ key, name, emoji }`. The `key` must match the DB `sports` table row (step 2). |
| **Match formats** | `MATCH_FORMATS` | One entry per playable format: `key`, `label`, `short` ("2v2"), `playersPerSide`, `sides` (3 only for 1v1v1-style games), `totalPlayers`, `blurb`, `default`, `casual` (pickup-only, excluded from preferences). This drives the create-match picker, the "who you're looking for" breakdown, capacity, validation, and every format label on the site. |
| Team (squad) size | `SPORT_TEAM_SIZE` | `{ min, default, max }` for the Teams feature roster. |
| Slug | `sportSlug()` | Only if the key is long (like `beach_volleyball` → `beach`) — it names the color token. |

`lib/sport-play-options.ts` **derives automatically** from `MATCH_FORMATS`
(preference lists add a "Both"/"Any size" flexible option; single-format
sports lock). Only touch it if the sport needs a different flexible option or
a sport-specific hand label (`sportHandLabel`).

## 2. Database — one migration (REQUIRED)

1. Insert the sport into the `sports` table (key must equal the registry key).
2. Seed its rows into `sport_formats` — an exact mirror of the registry entry
   (see migration `0164_sport_formats.sql` for the pattern). The composite FK
   from `matches (sport_key, format)` means an unseeded format cannot be
   stored, even by a hand-crafted insert.
3. If the sport has a self-rating system, add its skill config the way the
   existing sports do (system name, e.g. UTR/DUPR-style; `NONE` hides the
   rating input — beach volleyball's CBVA letter divisions are `NONE`).

## 3. Visual identity (REQUIRED)

| What | Where |
| --- | --- |
| Color token | `app/globals.css` → `--color-sport-<slug>` |
| Tone triple | `components/sport-chip.tsx` → `SPORT_TONES` (fg/bg/bd) |
| Icon glyph | `components/sport-icons.tsx` → `SportIcon` branch (glyph + badge variants) |

## 4. Playbook content (REQUIRED)

| What | Where | Notes |
| --- | --- | --- |
| Full rules entry | `lib/resources.ts` | Overview, serving, rally rules, faults, etiquette, equipment, glossary — written from the governing-body source, not memory. |
| Court diagram | `components/court-diagram.tsx` | Labeled, to-scale SVG branch. Orientation matters: draw it from the player's point of view (racquetball's front wall is at the TOP, directly in front of the service zone). |

## 5. Verify every consuming surface (CHECKLIST)

The surfaces below take everything from the registries — after steps 1–4 they
should all be correct with **zero page edits**. Verify each:

- `/play/new` — sport card appears; format cards show the sport's real
  formats; the "who you're looking for" breakdown matches (`You + N vs M`,
  total players, open spots); capacity derives from the format.
- Match cards & detail (`/play`, `/play/[id]`, home, chats, `/me`,
  `/discover`) — `matchFormatLabel` renders the right label.
- Onboarding wizard + Settings → Sports — preference formats derive; hand
  label reads correctly; rating input hides for `NONE` systems.
- Teams — create-team size limits come from `SPORT_TEAM_SIZE`.
- Tournaments — division team sizes (migration 0161 machinery) accept the
  sport; check the division size presets make sense for it.
- Search — the sport name resolves through `sportMeta` everywhere (AI search
  subtitles, admin expired list, filters via `lib/filter-params`).
- Playbook page — entry + diagram render.
- Public landing page — add the sport to the marketing copy (manual).

## 6. Structural options inventory (what a sport CAN define)

The complete set of per-sport options the system understands today:

- **Formats** (per format): key, label, short structure ("1v1v1"),
  players per side, number of sides, total players, default flag,
  casual/pickup flag, one-line blurb.
- **Team size**: min / default / max roster for the Teams feature.
- **Skill system**: named rating system or `NONE` (hides rating input).
- **Hand label**: what the dominant-hand question is called.
- **Visuals**: color token, tone triple, icon glyph, emoji.
- **Content**: full playbook rules entry + court diagram.
- **DB identity**: `sports` row + `sport_formats` seed rows (FK-enforced).

If a new sport needs an option that doesn't exist in this list (e.g. timed
periods, referee roles), **add it to the registry type first**, then consume
it from pages — never the other way around.
