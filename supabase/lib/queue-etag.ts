/** ETag for the queue poll endpoint (K2-02, audit QUEUE-003).
 *
 *  SECURITY PROPERTY: the tag encodes the AUDIENCE and the viewer, not just
 *  the session version. Organizer and public payloads differ (K0-04
 *  projection), so a shared tag across audiences would let a 304 hand one
 *  viewer a cache entry built for another — the geofence centre and pending
 *  list would leak through the cache instead of through the payload.
 *  Weak validator (W/) because the body is semantically, not byte, equivalent. */
// KCDX-008 adds a fourth audience: a registered Courtside display, which sees
// the operator credential and nothing else the organizer sees. It has to be part
// of the ETag key — otherwise a cached "player" snapshot could be served to a
// display, or worse, an operator snapshot to a player.
export type QueueAudience = "org" | "operator" | "player" | "public";

export function queueEtag(
  sessionId: string,
  version: number,
  audience: QueueAudience,
  viewerId: string | null,
): string {
  return `W/"${sessionId}.${version}.${audience}.${viewerId ?? "anon"}"`;
}

/** A version of 0 means "unknown" (the counter has never been written or the
 *  RPC failed) — never serve a 304 off an unknown version, or a client could
 *  pin a stale snapshot forever. */
export function canServe304(version: number, ifNoneMatch: string | null, currentEtag: string): boolean {
  return version > 0 && ifNoneMatch === currentEtag;
}
