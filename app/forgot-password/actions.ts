"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ForgotState = { sent?: boolean; error?: string; email?: string };

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address.", email };
  }

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  // The recovery link lands on /auth/confirm (exchanges the code → recovery
  // session) and forwards to /reset-password to set a new password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });

  // Uniform — never reveal whether an account exists.
  return { sent: true, email };
}
