"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreatePwState = { error?: string };

const MIN_PASSWORD = 10;

export async function createPassword(
  _prev: CreatePwState,
  formData: FormData,
): Promise<CreatePwState> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (password.length < MIN_PASSWORD) {
    return { error: `Use a password of at least ${MIN_PASSWORD} characters.` };
  }
  if (password !== confirm) {
    return { error: "Those passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Email is never taken from the form — the password is set on the
  // authenticated session's user, so the locked email field can't be spoofed.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "weak_password" || /password/i.test(error.message)) {
      return { error: "Choose a stronger password — longer, and not one found in known breaches." };
    }
    return { error: "Could not save your password. Try again in a moment." };
  }

  // Two-factor enrollment (enforced by middleware) sits between here and the
  // wizard, so the next stop is /mfa, then onboarding.
  redirect("/onboarding");
}
