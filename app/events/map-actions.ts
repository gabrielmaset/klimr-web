"use server";

import { mapsPointFromUrl, type LatLng } from "@/lib/maps-url";

/** Resolve a pasted Maps link (incl. short links) to a precise point for the
 *  edit-form preview — same resolver the event page uses, so what the organizer
 *  sees while editing is exactly what members will see. */
export async function resolveEventMapPoint(url: string): Promise<LatLng | null> {
  return mapsPointFromUrl(url);
}
