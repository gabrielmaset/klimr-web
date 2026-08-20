import type { SearchResultType } from "@/app/search/types";

/** Deterministic query interpretation — the provable hot path (audit
 *  SRCH-004 discipline · K1-04 golden corpus). Extracted verbatim from
 *  globalSearch so the exact same logic that runs in production is unit-tested
 *  against a fixed adversarial corpus in CI, with no DB or model in the loop.
 *  Given a raw query it returns which entity kinds the query selects and the
 *  condensed text handed to the tsvector/trigram matcher. */

const KIND_HINTS: Record<string, SearchResultType> = {
  event: "event", events: "event", meetup: "event", meetups: "event",
  tournament: "tournament", tournaments: "tournament", bracket: "tournament",
  court: "court", courts: "court", venue: "court", venues: "court",
  player: "player", players: "player", people: "player",
  team: "team", teams: "team",
  listing: "listing", listings: "listing", marketplace: "listing", gear: "listing",
  class: "class", classes: "class", coach: "class", coaches: "class",
  lesson: "class", lessons: "class", coaching: "class",
  dietitian: "class", dietitians: "class", nutritionist: "class",
  physio: "class", trainer: "class", instructor: "class",
};

const STOP = new Set([
  "any", "all", "some", "the", "a", "an", "in", "on", "at", "for", "to", "of", "with", "near",
  "me", "my", "our", "is", "are", "there", "what", "when", "where", "which", "who", "how", "do",
  "does", "can", "i", "you", "we", "next", "this", "week", "weekly", "month", "monthly", "today",
  "tomorrow", "upcoming", "find", "show", "looking", "want",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "and", "or", "vs", "versus", "plus",
]);

export type QueryInterpretation = {
  /** Entity kinds this query targets (empty ⇒ search everything). */
  kinds: Set<SearchResultType>;
  /** The salient terms handed to the matcher (kind + stop words stripped). */
  condensed: string;
  /** True when a kind word appears with no informative terms — a request to
   *  browse that kind rather than text-match ("tournaments", "events next month"). */
  isBrowseIntent: boolean;
};

export function interpretQuery(qRaw: string): QueryInterpretation {
  const q = (qRaw ?? "").trim();
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  const kinds = new Set<SearchResultType>();
  for (const w of words) {
    const k = KIND_HINTS[w.toLowerCase()];
    if (k) kinds.add(k);
  }
  // "events" is an UMBRELLA that includes tournaments; the reverse is not true.
  if (kinds.has("event")) kinds.add("tournament");

  const informative = words.filter((w) => {
    const lw = w.toLowerCase();
    return !STOP.has(lw) && !KIND_HINTS[lw];
  });
  const condensed = informative.slice(0, 4).join(" ");

  return { kinds, condensed, isBrowseIntent: kinds.size > 0 && condensed === "" };
}
