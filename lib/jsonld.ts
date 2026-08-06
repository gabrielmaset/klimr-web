/** Serialize JSON-LD for a <script type="application/ld+json"> block without
 *  letting user-controlled strings break out of the element (audit SEC-005).
 *  `<` becomes \u003c so "</script>" inside a tournament/team/event title can
 *  never terminate the script tag; U+2028/U+2029 are escaped because they are
 *  valid JSON but illegal in JavaScript source. JSON semantics are unchanged —
 *  parsers see identical data. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
