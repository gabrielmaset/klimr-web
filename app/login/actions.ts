"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  ok?: boolean;
  sent?: boolean; // magic link dispatched
  error?: string;
  email?: string;
};

function safePath(value: FormDataEntryValue | null) {
  const s = String(value || "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/account";
}

/** Primary path: email + password. Generic failure copy — never reveals whether the email exists. */
export async function signInPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = safePath(formData.get("next"));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return { error: "Enter your email and password.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "email_not_confirmed") {
      return {
        error: "If you just signed up, confirm your email first — check your inbox for the link.",
        email,
      };
    }
    // Identical message for wrong password and unknown account (anti-enumeration).
    return { error: "That email or password is incorrect.", email };
  }

  // Session starts at aal1; middleware routes to /mfa for the 2FA step before /account.
  redirect(next);
}

/** Kept option: passwordless magic link. Always reports success (never leaks existence). */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const next = safePath(formData.get("next"));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address.", email };
  }

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  // shouldCreateUser:false — sign-IN only; new accounts go through /signup with an invite.
  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  // Uniform response whether or not an account exists.
  return { sent: true, email };
}
