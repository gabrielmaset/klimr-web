import "server-only";
import { nextStatusForMemberRequest } from "@/lib/verification-rules";
import { createAdminClient } from "@/lib/supabase/admin";

/** The ONLY user-reachable verification transition: unverified → pending.
 *
 *  Why one function (Aug 2026, audit SEC-001/ID-001): the DB guard
 *  `guard_verification_status` silently PRESERVES the old value for
 *  non-service-role writers — it does not raise — so a user-client update
 *  "succeeds" while changing nothing. Every request path (account page,
 *  onboarding wizard step, phone-handoff page) must therefore go through the
 *  service-role client, and they all go through here so the transition rules
 *  live in exactly one place. pending → verified is admin-only
 *  (app/admin/actions.ts, audit-logged); there is no self-approve path. */

export { nextStatusForMemberRequest } from "@/lib/verification-rules";

/** Files (or re-files, idempotently) a manual-review request for `userId`.
 *  Never downgrades: verified and pending rows are left untouched. */
export async function submitVerificationRequest(
  userId: string,
): Promise<{ ok: boolean; status: "pending" | "verified" | "unchanged" }> {
  const admin = createAdminClient();
  const { data: me } = await admin
    .from("profiles")
    .select("verification_status")
    .eq("id", userId)
    .maybeSingle();
  if (me?.verification_status === "verified") return { ok: true, status: "verified" };
  if (nextStatusForMemberRequest(me?.verification_status) === null)
    return { ok: true, status: me?.verification_status === "pending" ? "pending" : "unchanged" };
  const { error } = await admin
    .from("profiles")
    .update({ verification_status: "pending" })
    .eq("id", userId)
    .eq("verification_status", "unverified");
  return error ? { ok: false, status: "unchanged" } : { ok: true, status: "pending" };
}
