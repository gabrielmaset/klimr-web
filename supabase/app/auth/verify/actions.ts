"use server";

import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Only ever redirect within this site: a path starting with exactly one "/". */
function safePath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

/**
 * Verifies a magic-link / signup token_hash and starts the session.
 * Runs only on a real button press (a POST), so email link-scanners that
 * merely GET the page never consume the single-use token.
 */
export async function confirmSignIn(formData: FormData) {
  const token_hash = String(formData.get("token_hash") || "");
  const type = String(formData.get("type") || "") as EmailOtpType;
  const next = safePath(String(formData.get("next") || ""));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
  }

  redirect("/login?error=link");
}
