"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/** Remove an email-only waitlist entry via its id (used as an unguessable token
 *  in the notification email's withdraw link). No auth — the id is the secret. */
export async function withdrawEmailWaitlist(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "Missing waitlist reference." };
  const admin = createAdminClient();
  const { data: w } = await admin.from("tournament_waitlist").select("id, status").eq("id", id).maybeSingle();
  if (!w) return { ok: false, error: "We couldn't find that waitlist entry." };
  if (w.status === "removed") return { ok: true };
  await admin.from("tournament_waitlist").update({ status: "removed" }).eq("id", id);
  return { ok: true };
}
