"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Revoke every session/refresh token for this user, everywhere. */
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
