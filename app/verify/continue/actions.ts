"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

/** Consume the handoff: single-use, unexpired token → file the verification
 *  request (status 'pending') for its owner. Never downgrades 'verified'. */
export async function confirmHandoff(formData: FormData) {
  const token = String(formData.get("token") || "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) redirect("/verify/continue");
  const admin = createAdminClient();

  const { data: h } = await admin
    .from("verification_handoffs")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (!h) redirect("/verify/continue");

  const { data: me } = await admin.from("profiles").select("verification_status").eq("id", h.user_id).maybeSingle();
  if (me?.verification_status !== "verified") {
    await admin.from("profiles").update({ verification_status: "pending" }).eq("id", h.user_id);
  }
  redirect("/verify/continue/done");
}
