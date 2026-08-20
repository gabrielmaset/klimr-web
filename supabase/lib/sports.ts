/** The Klimr sports. Keys match the DB `sports` table; emoji is presentation.
 *  Beach volleyball joins the four racquet sports as a fully ranked sport. */
export const SPORTS = [
  { key: "tennis", name: "Tennis", emoji: "🎾" },
  { key: "pickleball", name: "Pickleball", emoji: "🏓" },
  { key: "padel", name: "Padel", emoji: "🟡" },
  { key: "racquetball", name: "Racquetball", emoji: "🟦" },
  { key: "beach_volleyball", name: "Beach Volleyball", emoji: "🏐" },
] as const;

export type SportKey = (typeof SPORTS)[number]["key"];

export const SPORT_KEYS: string[] = SPORTS.map((s) => s.key);

export function sportMeta(key: string): { key: string; name: string; emoji: string } {
  return SPORTS.find((s) => s.key === key) ?? { key, name: key, emoji: "•" };
}

/** Slug for the per-sport color token `--color-sport-<slug>` (see app/globals.css
 *  and components/sport-chip.tsx). The DB key `beach_volleyball` maps to the
 *  shorter `beach`; every other sport uses its key unchanged. */
export function sportSlug(key: string): string {
  return key === "beach_volleyball" ? "beach" : key;
}


/* ═══════════════════════════════════════════════════════════════════════
   MATCH FORMATS — the canonical, research-verified play structures per sport.
   THE single source every surface must consume (create-match picker, match
   cards, filters, validation). Nothing about formats may be hard-coded in a
   page. Mirrored in the DB as `sport_formats` (migration 0164) with an FK
   from `matches`, so invalid combinations can't exist even at the SQL layer.

   Verified against governing bodies (2026):
   • Tennis/Pickleball — singles & doubles, the universal pair.
   • Padel — FIP standard courts are 20×10 m DOUBLES courts; singles (20×6 m)
     courts exist but are rare training variants, so Klimr padel is doubles-
     only (matches the player-preference seam that already locks padel).
   • Racquetball — USA Racquetball Rule 1.1: two players = singles, four =
     doubles; CUTTHROAT is the recognized three-player non-tournament game
     (1 v 1 v 1, server vs the other two, rotating) — a pickup staple.
   • Beach volleyball — 2v2 is the sanctioned standard (Olympic/FIVB/AVP);
     FIVB also publishes official 4v4 rules; 3s & 4s are the rec-league
     staples. 6s runs as an Events-sized gathering, not a pickup match
     (match capacity is designed around small groups).

   ADDING A SPORT: fill one entry here + the checklist in
   docs/ADDING_A_SPORT.md. That's the whole contract.
   ═══════════════════════════════════════════════════════════════════════ */

export type MatchFormat = {
  key: string;
  /** Display label — also used by the player-preference seam. */
  label: string;
  /** Compact structure chip: "1v1", "2v2", "1v1v1"… */
  short: string;
  playersPerSide: number;
  /** 2 for normal team-vs-team; 3 for racquetball cutthroat (1v1v1). */
  sides: number;
  totalPlayers: number;
  /** One-line explainer shown in the create-match picker. */
  blurb: string;
  default?: boolean;
  /** Non-sanctioned pickup variant (no tournament play). */
  casual?: boolean;
};

export const MATCH_FORMATS: Record<string, MatchFormat[]> = {
  tennis: [
    { key: "singles", label: "Singles", short: "1v1", playersPerSide: 1, sides: 2, totalPlayers: 2, blurb: "One on one — your game, your board.", default: true },
    { key: "doubles", label: "Doubles", short: "2v2", playersPerSide: 2, sides: 2, totalPlayers: 4, blurb: "Team chemistry and net play." },
  ],
  pickleball: [
    { key: "doubles", label: "Doubles", short: "2v2", playersPerSide: 2, sides: 2, totalPlayers: 4, blurb: "The social heart of pickleball.", default: true },
    { key: "singles", label: "Singles", short: "1v1", playersPerSide: 1, sides: 2, totalPlayers: 2, blurb: "Whole court, all yours — a workout." },
  ],
  padel: [
    { key: "doubles", label: "Doubles", short: "2v2", playersPerSide: 2, sides: 2, totalPlayers: 4, blurb: "Padel is a doubles game — standard courts are built for four.", default: true },
  ],
  racquetball: [
    { key: "singles", label: "Singles", short: "1v1", playersPerSide: 1, sides: 2, totalPlayers: 2, blurb: "One on one — your game, your board.", default: true },
    { key: "doubles", label: "Doubles", short: "2v2", playersPerSide: 2, sides: 2, totalPlayers: 4, blurb: "Team chemistry in a fast box." },
    { key: "cutthroat", label: "Cutthroat", short: "1v1v1", playersPerSide: 1, sides: 3, totalPlayers: 3, blurb: "Three players, server vs the other two — the classic pickup game.", casual: true },
  ],
  beach_volleyball: [
    { key: "2s", label: "2s (pairs)", short: "2v2", playersPerSide: 2, sides: 2, totalPlayers: 4, blurb: "The classic — you and a partner, whole court.", default: true },
    { key: "3s", label: "3s (triples)", short: "3v3", playersPerSide: 3, sides: 2, totalPlayers: 6, blurb: "More coverage, faster rotations." },
    { key: "4s", label: "4s (fours)", short: "4v4", playersPerSide: 4, sides: 2, totalPlayers: 8, blurb: "The big social format." },
  ],
};

export function matchFormats(sportKey: string): MatchFormat[] {
  return MATCH_FORMATS[sportKey] ?? [];
}

export function defaultMatchFormat(sportKey: string): MatchFormat | null {
  const list = matchFormats(sportKey);
  return list.find((f) => f.default) ?? list[0] ?? null;
}

export function matchFormatMeta(sportKey: string, formatKey: string): MatchFormat | null {
  return matchFormats(sportKey).find((f) => f.key === formatKey) ?? null;
}

/** Display label with graceful legacy fallback — old beach matches created
 *  before 0164 stored "singles"/"doubles"; those rows are normalized by the
 *  migration, but any stragglers still render sensibly. */
export function matchFormatLabel(sportKey: string, formatKey: string): string {
  const hit = matchFormatMeta(sportKey, formatKey);
  if (hit) return hit.label;
  if (sportKey === "beach_volleyball") return "2s (pairs)";
  return formatKey ? formatKey.charAt(0).toUpperCase() + formatKey.slice(1) : "";
}

/** Per-sport team (squad) size. Min is always 2 — a one-person team can't exist.
 *  Default is what the create wizard starts at; max is the hard cap on the roster. */
export const SPORT_TEAM_SIZE: Record<string, { min: number; default: number; max: number }> = {
  tennis: { min: 2, default: 2, max: 4 },
  pickleball: { min: 2, default: 2, max: 4 },
  padel: { min: 2, default: 2, max: 4 },
  racquetball: { min: 2, default: 2, max: 4 },
  beach_volleyball: { min: 2, default: 2, max: 6 },
};

export function teamSizeFor(key: string): { min: number; default: number; max: number } {
  return SPORT_TEAM_SIZE[key] ?? { min: 2, default: 2, max: 4 };
}
