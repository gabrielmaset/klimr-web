# Klimr type system — the complete inventory

One source of truth for every typeface in the product. If a font isn't in
this table, it doesn't ship. All fonts load via `@fontsource` packages in
`app/layout.tsx`; roles are exposed as CSS variables in `app/globals.css`
(`@theme`) and consumed through Tailwind (`font-display`, `font-mono`, …) or
the `.kicker` utility — never hard-coded per page.

| Role | Font | Where it's used | Why |
| --- | --- | --- | --- |
| Display | **Space Grotesk Variable** | H1–H3, hero numbers, `font-display`, `--font-athletic` | The brand voice — geometric, athletic, confident. |
| UI / body | **Instrument Sans Variable** | Everything conversational: body copy, buttons, forms (`--font-sans`) | Neutral, warm, excellent at 13–15px. |
| Mono / data | **Spline Sans Mono Variable** | Kickers (`.kicker`), counts, dates, times, distances, codes (`--font-mono`, `--font-kicker`) | A humanist grotesque mono — Space Grotesk's natural companion. Its **slashed zero** stays unambiguous even at 9.5px uppercase kickers. Replaced JetBrains Mono (dotted zero disappears at small sizes → 0/O confusion) and the legacy Space Mono (plain zero, machinery feel). |
| Editorial (scoped) | **Hanken Grotesk Variable** | Tournament public pages only (`.tp` theme) | The "Ales Cup" editorial voice; never leaks into the app shell. |
| Logotype (scoped) | **Fraunces Variable** | `components/logo.tsx` only | The wordmark; not a text face. |

Retired: **JetBrains Mono** (2026-08 — replaced by Spline Sans Mono),
**Space Mono** (2026-08 — same swap; was the `.tp-mono` accent),
**Inter** (was referenced in `@theme` but never installed — the references
were phantoms resolving to system-ui; cleaned to Instrument Sans).

Rules: new UI must use a role variable, not a family name. Adding a typeface
requires an entry here plus the rationale — and check the numerals at 9px
before anything else.
