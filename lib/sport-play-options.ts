/** Per-sport play options — because padel has no singles, volleyball has no
 *  racquets, and beach runs in team sizes. One source of truth for the wizard
 *  and the sports editor; values stay in player_sports.format / .hand. */

export type PlayOption = { value: string; label: string; blurb?: string };

const RACQUET_FORMATS: PlayOption[] = [
  { value: "singles", label: "Singles", blurb: "One on one — your game, your board." },
  { value: "doubles", label: "Doubles", blurb: "Team chemistry and net play." },
  { value: "both", label: "Both", blurb: "Whatever the court calls for." },
];

const BEACH_FORMATS: PlayOption[] = [
  { value: "2s", label: "2s (pairs)", blurb: "The classic — you and a partner, whole court." },
  { value: "3s", label: "3s (triples)", blurb: "More coverage, faster rotations." },
  { value: "4s", label: "4s (fours)", blurb: "The big social format." },
  { value: "any", label: "Any size", blurb: "Put me on whatever's running." },
];

export function sportFormats(sportKey: string): PlayOption[] {
  if (sportKey === "beach_volleyball") return BEACH_FORMATS;
  if (sportKey === "padel") return [{ value: "doubles", label: "Doubles", blurb: "Padel is a doubles game — locked in." }];
  return RACQUET_FORMATS;
}

/** Padel is doubles-only: the format is fixed, not chosen. */
export function sportFormatFixed(sportKey: string): string | null {
  return sportKey === "padel" ? "doubles" : null;
}

/** What the dominant-hand question is called per sport (never "racquet" for
 *  a sport without one). */
export function sportHandLabel(sportKey: string): string {
  if (sportKey === "beach_volleyball") return "Dominant hand";
  if (sportKey === "pickleball") return "Paddle hand";
  if (sportKey === "padel") return "Racket hand";
  return "Racquet hand";
}

export function playFormatLabel(sportKey: string, value: string): string {
  const hit = sportFormats(sportKey).find((f) => f.value === value);
  if (hit) return hit.label;
  if (value === "both") return sportKey === "beach_volleyball" ? "Any size" : "Both";
  return value;
}

/** Some sports have no numeric self-rating system (beach volleyball's CBVA
 *  divisions are letters, not numbers) — their DB rows carry 'NONE' or null.
 *  Hide the rating input entirely for those. */
export function hasRatingSystem(skillSystem: string | null | undefined): boolean {
  if (!skillSystem) return false;
  return skillSystem.trim().toLowerCase() !== "none";
}
