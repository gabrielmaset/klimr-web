"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreatePwState = { error?: string };

const MIN_PASSWORD = 8;

// The most-guessed passwords + obvious patterns. Anything here — or a password
// that merely contains the user's name or email handle — is rejected.
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789",
  "1234567890", "qwertyuiop", "qwerty123", "1q2w3e4r", "iloveyou", "letmein",
  "welcome1", "admin123", "abc12345", "11111111", "00000000", "football",
  "baseball", "sunshine", "princess", "trustno1", "klimr123", "changeme",
  "qwerty12345", "passw0rd1", "p@ssw0rd", "iloveyou1",
]);

function validate(password: string, identifiers: string[]): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[a-z]/.test(password)) return "Add a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Add a number.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common — pick something harder to guess.";
  for (const id of identifiers) {
    const token = id.toLowerCase().trim();
    if (token.length >= 3 && lower.includes(token)) {
      return "Don't base your password on your name or email.";
    }
  }
  return null;
}

export async function createPassword(
  _prev: CreatePwState,
  formData: FormData,
): Promise<CreatePwState> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (password !== confirm) {
    return { error: "Those passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Reached from the confirmation link, which establishes a session.
  if (!user) redirect("/login");

  // The password must not be built around the user's name or email handle.
  const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
  const emailLocal = (user.email ?? "").split("@")[0] ?? "";
  const nameTokens = (prof?.display_name ?? "").split(/\s+/).filter(Boolean);
  const identifiers = [emailLocal, ...nameTokens, prof?.display_name ?? ""].filter(Boolean);

  const problem = validate(password, identifiers);
  if (problem) return { error: problem };

  // Set the password on the authenticated session's user (the locked email can't
  // be spoofed), and mark password_set so middleware lets them past this step.
  const { error } = await supabase.auth.updateUser({
    password,
    data: { password_set: true },
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "weak_password" || /password/i.test(error.message)) {
      return { error: "Choose a stronger password — longer, and not one found in known breaches." };
    }
    return { error: "Could not save your password. Try again in a moment." };
  }

  // 2FA enrollment (enforced by middleware) sits between here and the wizard.
  redirect("/onboarding");
}
