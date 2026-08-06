"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { submitVerificationRequest } from "@/lib/verification";

/** User submits for verification: unverified -> pending, via the single
 *  server-mediated transition in lib/verification.ts (audit SEC-001/ID-001). */
export async function startVerification() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await submitVerificationRequest(user.id);
  revalidatePath("/account");
}

