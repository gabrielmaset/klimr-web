/** lib/filter-params.ts — the canonical URL-filter vocabulary.
 *
 *  Search must CONTINUE, never dead-end (Gabriel's rule): every producer of a
 *  link — the AI concierge, browse rows, "See all …" overflow — encodes its
 *  active criteria as URL params, and every listing page reads the SAME params
 *  as its initial filter state, then keeps the URL in sync as the user adjusts
 *  filters. Links are shareable, back/forward-safe, and context is never lost
 *  between the search box and the page it lands on.
 *
 *  Vocabulary (identical meaning on every page that supports the concept):
 *    sport=<sport_key>          one key, validated against lib/sports
 *    sport=<key,key>            multi-select pages accept a comma list
 *    spots=<n>                  minimum open roster spots (teams)
 *    q=<text>                   free-text query
 *    from=<ISO> / to=<ISO>      date range where a page supports it
 *
 *  Adding a page: read initial state with the readers below, write state back
 *  with the same keys (URLSearchParams + router.replace), and produce inbound
 *  links with filterHref(). Never invent page-private names for these concepts.
 */
import { SPORT_KEYS } from "@/lib/sports";

type RawParam = string | string[] | undefined | null;

const first = (v: RawParam): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** One validated sport key, or null. Unknown keys are dropped, never trusted. */
export function readSportParam(v: RawParam): string | null {
  const s = first(v);
  return s && SPORT_KEYS.includes(s) ? s : null;
}

/** Comma-separated sport keys for multi-select pages; invalid keys dropped. */
export function readSportsParam(v: RawParam): string[] {
  const s = first(v);
  if (!s) return [];
  return [...new Set(s.split(",").map((k) => k.trim()).filter((k) => SPORT_KEYS.includes(k)))];
}

/** Bounded integer param, or null when absent/invalid. */
export function readIntParam(v: RawParam, min: number, max: number): number | null {
  const s = first(v);
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Trimmed, length-capped free text, or null when empty. */
export function readTextParam(v: RawParam, maxLen = 80): string | null {
  const t = (first(v) ?? "").trim().slice(0, maxLen);
  return t || null;
}

/** Build a deep link carrying filters; empty/invalid values are omitted so
 *  clean state produces a clean path. `sport` accepts a key or a key list. */
export function filterHref(
  path: string,
  f: { sport?: string | string[] | null; spots?: number | null; q?: string | null; from?: string | null; to?: string | null },
): string {
  const p = new URLSearchParams();
  const sportList = (Array.isArray(f.sport) ? f.sport : f.sport ? [f.sport] : []).filter((k) => SPORT_KEYS.includes(k));
  if (sportList.length) p.set("sport", sportList.join(","));
  if (f.spots && f.spots > 0) p.set("spots", String(Math.floor(f.spots)));
  if (f.q?.trim()) p.set("q", f.q.trim().slice(0, 80));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}
