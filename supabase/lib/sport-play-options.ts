/** Per-sport PLAYER-PREFERENCE options — derived from the canonical
 *  MATCH_FORMATS registry in lib/sports (one source of truth; this file adds
 *  only the "flexible" preference that a concrete match can't have).
 *  Values are stored in player_sports.format / .hand and MUST stay stable:
 *  singles/doubles/both for racquet sports, 2s/3s/4s/any for beach,
 *  doubles for padel. Cutthroat is a pickup format, not a preference. */

import { matchFormats } from "@/lib/sports";

export type PlayOption = { value: string; label: string; blurb?: string };

export function sportFormats(sportKey: string): PlayOption[] {
  const base = matchFormats(sportKey)
    .filter((f) => !f.casual)
    .map((f) => ({ value: f.key, label: f.label, blurb: f.blurb }));
  if (sportKey === "padel") return base; // doubles-only: fixed, not chosen
  if (sportKey === "beach_volleyball") {
    return [...base, { value: "any", label: "Any size", blurb: "Put me on whatever's running." }];
  }
  return [...base, { value: "both", label: "Both", blurb: "Whatever the court calls for." }];
}

/** Padel is doubles-only: the format is fixed, not chosen. */
export function sportFormatFixed(sportKey: string): string | null {
  const list = matchFormats(sportKey).filter((f) => !f.casual);
  return list.length === 1 ? list[0].key : null;
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
