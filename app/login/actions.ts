"use server";
import { headers } from "next/headers";
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
