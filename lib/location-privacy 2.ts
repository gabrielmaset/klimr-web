/** Location display rule — Klimr's model, decided 2026-07-29: other members
 *  always see CITY, STATE. Neighborhood and city are near-synonyms in the LA
 *  launch geography, and precision tiers added a control nobody needed. The
 *  0145 columns/trigger remain harmlessly dormant if the migration ran. */

/** KCDX-026: the parameter type no longer ADMITS `neighborhood`.
 *
 *  The rule above was already right and the implementation already preferred
 *  `city` — but every caller was still fetching `neighborhood` to satisfy this
 *  signature, so the finer location travelled through the discovery RPCs, the
 *  search subtitle and the PYMK rail regardless of whether it was displayed.
 *  A field that cannot be passed cannot be selected "just in case". */
export function publicLocationLabel(p: {
  city: string | null;
  state: string | null;
}): string {
  return [p.city, p.state].filter(Boolean).join(", ") || "Location unset";
}
