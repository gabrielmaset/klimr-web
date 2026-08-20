// Second Serve (gear marketplace) — shared constants + helpers.
// Palette per KLIMR-MARKETPLACE-HANDOFF §1; house tokens where roles match.


// KFU-015: everything client-safe moved to marketplace-shared (star re-export
// keeps every server import working unchanged). This module keeps ONLY the
// zip-dependent pieces and therefore inherits server-only from lib/us-places —
// a client component importing this file is a BUILD ERROR by design.
export * from "./marketplace-shared";

import { lookupZip } from "@/lib/us-places";

/** Neighborhood-level distance between two ZIP centroids (miles, 1dp). */
export function zipDistanceMi(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const za = lookupZip(a);
  const zb = lookupZip(b);
  if (!za || !zb) return null;
  const R = 3958.8;
  const dLat = ((zb.lat - za.lat) * Math.PI) / 180;
  const dLng = ((zb.lng - za.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((za.lat * Math.PI) / 180) * Math.cos((zb.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}
