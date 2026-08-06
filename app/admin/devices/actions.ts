"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";

/** Operator-owned device fields (K2-05). The device owns telemetry; the
 *  operator owns naming and retirement. Admin-gated, so AAL2 per K1-02. */
export async function labelDevice(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin("support");
  const id = String(formData.get("installId") ?? "");
  if (!id) return;
  const admin = getPrivilegedClient({ reason: "admin:label-device", actorId: userId, targetRef: id });
  await admin
    .from("courtside_devices")
    .update({
      label: String(formData.get("label") ?? "").slice(0, 60) || null,
      venue_name: String(formData.get("venueName") ?? "").slice(0, 80) || null,
      notes: String(formData.get("notes") ?? "").slice(0, 400) || null,
    })
    .eq("install_id", id);
  revalidatePath("/admin/devices");
}

/** Retire a unit (lost, replaced, decommissioned). Reversible: retiring only
 *  sets a timestamp, so a device that comes back can be un-retired. */
export async function retireDevice(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin("support");
  const id = String(formData.get("installId") ?? "");
  if (!id) return;
  const undo = String(formData.get("undo") ?? "") === "1";
  const admin = getPrivilegedClient({ reason: "admin:retire-device", actorId: userId, targetRef: id });
  if (undo) {
    await admin.from("courtside_devices").update({ retired_at: null }).eq("install_id", id);
  } else {
    // Retiring also REVOKES the device token (0184), so a retired or stolen
    // unit stops being able to report at all rather than merely being hidden.
    await admin.from("courtside_devices").update({ retired_at: new Date().toISOString() }).eq("install_id", id);
    await admin.rpc("courtside_revoke", { p_install_id: id });
  }
  revalidatePath("/admin/devices");
}
