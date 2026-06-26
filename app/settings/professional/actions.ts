"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleMeta } from "@/lib/professional-roles";

export async function requestProfessionalStatus(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/professional");

  const role = String(formData.get("role") ?? "");
  const meta = roleMeta(role);
  if (!meta) redirect("/settings/professional?error=role");

  const s = (k: string) => (formData.get(k) as string | null)?.trim() || "";
  const credentialId = s("credential_id");
  // Health/regulated roles must include a credential to verify.
  if (meta.requiresCredential && !credentialId) redirect("/settings/professional?error=credential");

  // One open application per role at a time.
  const { data: existing } = await supabase
    .from("provider_applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", role)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) redirect("/settings/professional?error=duplicate");

  await supabase.from("provider_applications").insert({
    user_id: user.id,
    role,
    status: "pending",
    headline: s("headline") || null,
    bio: s("bio") || null,
    credential_type: s("credential_type") || meta.credentialOrg || null,
    credential_id: credentialId || null,
    credential_jurisdiction: s("credential_jurisdiction") || null,
    verification_url: s("verification_url") || null,
    applicant_note: s("applicant_note") || null,
  });

  revalidatePath("/settings/professional");
  redirect("/settings/professional?submitted=1");
}

export async function withdrawProfessionalApplication(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("applicationId") ?? "");
  if (!id) return;
  await supabase
    .from("provider_applications")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");
  revalidatePath("/settings/professional");
}
