// Event types (the `kind` field), scoped per sport to the formats each community actually
// runs, each with a one-line explanation so hosts aren't guessing what "Ladder night" means.

export type EventKind = { value: string; label: string; blurb: string };

const OPEN: EventKind = { value: "open_play", label: "Open play", blurb: "Drop in and rotate — casual games, no fixed teams, all levels welcome." };
const CLINIC: EventKind = { value: "clinic", label: "Clinic / lesson", blurb: "Coached instruction and drills to sharpen specific skills." };
const TOURNEY: EventKind = { value: "tournament", label: "Tournament", blurb: "Bracketed competition with sign-ups, seeding, and a winner." };
const SOCIAL: EventKind = { value: "social", label: "Social / mixer", blurb: "A low-key hangout — play plus food, drinks, or meeting new players." };
const LADDER: EventKind = { value: "ladder", label: "Ladder night", blurb: "An ongoing ranked ladder — challenge players above you to climb the standings." };
const RR: EventKind = { value: "round_robin", label: "Round robin", blurb: "Everyone rotates through short matches, so you play a variety of opponents." };
const KOTC: EventKind = { value: "kotc", label: "King of the court", blurb: "Winning team stays on; challengers rotate in. Fast and competitive." };
const AMERICANO: EventKind = { value: "americano", label: "Americano", blurb: "Rotating partners and opponents with individual points tallied — everyone plays with everyone." };
const MEXICANO: EventKind = { value: "mexicano", label: "Mexicano", blurb: "Like Americano, but each round pairs players by their current standings." };
const CHALLENGE: EventKind = { value: "challenge", label: "Challenge court", blurb: "Winner stays on and the next player in line takes them on." };
const CARDIO: EventKind = { value: "cardio", label: "Cardio tennis", blurb: "High-energy, music-driven fitness drills — a great workout, light on scoring." };

export const EVENT_KINDS_BY_SPORT: Record<string, EventKind[]> = {
  tennis: [OPEN, LADDER, RR, CARDIO, CLINIC, TOURNEY, SOCIAL],
  pickleball: [OPEN, RR, LADDER, KOTC, CLINIC, TOURNEY, SOCIAL],
  padel: [OPEN, AMERICANO, MEXICANO, LADDER, CLINIC, TOURNEY, SOCIAL],
  racquetball: [OPEN, CHALLENGE, RR, LADDER, CLINIC, TOURNEY, SOCIAL],
  beach_volleyball: [OPEN, KOTC, RR, LADDER, CLINIC, TOURNEY, SOCIAL],
};

const DEFAULT_KINDS: EventKind[] = [OPEN, LADDER, RR, CLINIC, TOURNEY, SOCIAL];

export function eventKindsFor(sportKey: string): EventKind[] {
  return EVENT_KINDS_BY_SPORT[sportKey] ?? DEFAULT_KINDS;
}

export const ALL_EVENT_KIND_VALUES: string[] = [...new Set(Object.values(EVENT_KINDS_BY_SPORT).flatMap((l) => l.map((k) => k.value)))];

export function eventKind(value: string): EventKind | undefined {
  for (const list of Object.values(EVENT_KINDS_BY_SPORT)) {
    const found = list.find((k) => k.value === value);
    if (found) return found;
  }
  return undefined;
}

export function eventKindLabel(value: string): string {
  return eventKind(value)?.label ?? value;
}
