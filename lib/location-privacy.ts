/** Location display rule — Klimr's model, decided 2026-07-29: other members
 *  always see CITY, STATE. Neighborhood and city are near-synonyms in the LA
 *  launch geography, and precision tiers added a control nobody needed. The
 *  0145 columns/trigger remain harmlessly dormant if the migration ran. */

export function publicLocationLabel(p: {
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  location_precision?: string | null;
}): string {
  return [p.city ?? p.neighborhood, p.state].filter(Boolean).join(", ") || "Location unset";
}
