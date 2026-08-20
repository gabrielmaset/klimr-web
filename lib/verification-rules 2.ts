/** Pure verification transition table (unit-tested; no server imports).
 *  Members can only ever move unverified → pending. Everything else —
 *  pending → verified above all — is admin-only via app/admin/actions.ts. */
export function nextStatusForMemberRequest(current: string | null | undefined): "pending" | null {
  return current === "unverified" || current == null ? "pending" : null;
}
