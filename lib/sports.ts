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
