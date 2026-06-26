"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** User submits for verification: unverified -> pending (server-mediated). */
export async function startVerification() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // The service-role client is required: the DB guard only lets the service role
  // change verification_status (users cannot self-verify).
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ verification_status: "pending" })
    .eq("id", user.id)
    .eq("verification_status", "unverified");
  revalidatePath("/account");
}

/**
 * STUB admin approval: pending -> verified. In production this is an admin-only
 * screen or the identity provider's webhook (Persona / Stripe Identity). It is
 * wired here, clearly labelled, only so the full flow is testable end to end.
 */
export async function approveVerification() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ verification_status: "verified" })
    .eq("id", user.id)
    .eq("verification_status", "pending");
  revalidatePath("/account");
}
