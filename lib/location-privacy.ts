/** Location-precision display rules — THE single place that decides how much
 *  of a player's location other members see (0145). Mirrors of the
 *  user_preferences setting live on profiles.location_precision by trigger.
 *    city         → city only
 *    neighborhood → neighborhood + city (default)
 *    zip          → everything, incl. ZIP where a surface shows it
 *  The subject always sees their own true values. Rankings remain ZIP-scoped
 *  (the ladder IS the ZIP); this governs profile display, not competition. */

export type LocationPrecision = "city" | "neighborhood" | "zip";

export function precisionOf(value: string | null | undefined): LocationPrecision {
  return value === "city" || value === "zip" ? value : "neighborhood";
}

/** The header-style area label ("Mar Vista, CA" / "Los Angeles, CA"). */
export function publicLocationLabel(
  p: { neighborhood: string | null; city: string | null; state: string | null; location_precision?: string | null },
  isSelf: boolean,
): string {
  const tier = precisionOf(p.location_precision);
  const primary = isSelf || tier !== "city" ? p.neighborhood ?? p.city : p.city;
  return [primary, p.state].filter(Boolean).join(", ") || "Location unset";
}

/** Whether a surface may show the raw ZIP to this viewer. */
export function zipVisible(p: { location_precision?: string | null }, isSelf: boolean): boolean {
  return isSelf || precisionOf(p.location_precision) === "zip";
}
