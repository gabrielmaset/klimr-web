/** The four Klimr sports. Keys match the DB `sports` table; emoji is presentation. */
export const SPORTS = [
  { key: "tennis", name: "Tennis", emoji: "🎾" },
  { key: "pickleball", name: "Pickleball", emoji: "🏓" },
  { key: "padel", name: "Padel", emoji: "🟡" },
  { key: "racquetball", name: "Racquetball", emoji: "🟦" },
] as const;

export type SportKey = (typeof SPORTS)[number]["key"];

export const SPORT_KEYS: string[] = SPORTS.map((s) => s.key);

export function sportMeta(key: string): { key: string; name: string; emoji: string } {
  return SPORTS.find((s) => s.key === key) ?? { key, name: key, emoji: "•" };
}
