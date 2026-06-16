"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error?: string };

const MIN_PASSWORD = 10;

export async function setNewPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
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

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "weak_password" || /password/i.test(error.message)) {
      return { error: "Choose a stronger password — longer, and not one found in known breaches." };
    }
    if (code === "same_password") {
      return { error: "That's already your password — choose a new one." };
    }
    return { error: "Could not update your password. Open the reset link again." };
  }

  redirect("/account");
}
