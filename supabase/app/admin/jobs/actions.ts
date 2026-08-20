"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";

/** Replay a dead or completed job (K2-03). Admin-gated; requireAdmin already
 *  asserts an AAL2 session (K1-02), so this is a stepped-up action. */
export async function replayJob(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin("support");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = getPrivilegedClient({ reason: "admin:replay-job", actorId: userId, targetRef: id });
  await admin.rpc("replay_job", { p_id: id });
  revalidatePath("/admin/jobs");
}
