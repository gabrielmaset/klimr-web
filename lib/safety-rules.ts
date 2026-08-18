/** Pure safety-preservation rules (KFU-007 / KFU-029).
 *
 *  These live apart from `lib/media-safety.ts` and `lib/safety-escalation.ts`
 *  deliberately: those modules import "server-only" and cannot be loaded by the
 *  test runner, which is precisely how the decision that MATTERS — may we
 *  destroy the only remaining copy of a safety object? — ended up with no
 *  executable test at all. The decision is pure, so it belongs where it can be
 *  proven.
 */

/** What an escalation actually achieved. Every field is an observed outcome, not
 *  an assumption: `escalateCSAE` used to swallow its errors and return void, so a
 *  caller could not tell a successful preservation from a failed one and deleted
 *  the original either way. */
export type EscalationResult = {
  /** The bytes are durably in the quarantine bucket. */
  preserved: boolean;
  /** The durable incident row, or null if it could not be written. */
  incidentId: string | null;
  /** The safety contact was notified. Not required for preservation. */
  alerted: boolean;
  /** Everything that went wrong, for the operator and the log. */
  errors: string[];
};

/** The rule that protects the evidence: the original object may be destroyed
 *  ONLY when a durable copy and a durable incident record both exist.
 *
 *  Deleting on a failed preservation is unrecoverable — the object is the
 *  evidence, and in the CSAE case it is legally required to be preserved. When
 *  preservation is incomplete the safe action is to LEAVE the original in place
 *  (it is already unpublishable) and raise loudly, because a retained object we
 *  can still act on beats a destroyed one we cannot. */
export function mayDestroyOriginal(result: EscalationResult): boolean {
  return result.preserved === true && result.incidentId !== null;
}

/** Why the original is being kept, in words an operator can act on. */
export function preservationHoldReason(result: EscalationResult): string | null {
  if (mayDestroyOriginal(result)) return null;
  if (!result.preserved && result.incidentId === null) {
    return "quarantine copy AND incident record both failed — original retained, manual preservation required";
  }
  if (!result.preserved) {
    return "quarantine copy failed — original retained as the only copy, manual preservation required";
  }
  return "incident record failed — original retained until the incident is recorded";
}

/** Categories that mean child sexual abuse or exploitation in a classifier
 *  verdict. Kept beside the rules rather than inside the provider adapter so the
 *  routing decision does not depend on which vendor produced the labels. */
const CSAE_CATEGORIES = [
  "csam",
  "csam_hash_match",
  "csae",
  "child_exploitation",
  "sexual/minors",
  "sexual_minors",
];

/** Does this set of verdict categories require the CSAE escalation path?
 *
 *  KFU-029: `containsCSAE` existed in the moderation module and was called from
 *  nowhere, so an AI verdict naming a minors category was handled as an ordinary
 *  refusal — the upload was rejected and the bytes were dropped, with no
 *  preservation and no incident. Rejecting is not the same as escalating. */
export function requiresCsaeEscalation(categories: readonly string[] | null | undefined): boolean {
  if (!categories || categories.length === 0) return false;
  return categories.some((c) => CSAE_CATEGORIES.includes(c.trim().toLowerCase()));
}
