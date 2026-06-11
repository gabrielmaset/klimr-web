"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { ok?: boolean; error?: string; email?: string };

function safePath(value: FormDataEntryValue | null) {
  const s = String(value || "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/account";
}

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address.", email };
  }
  const next = safePath(formData.get("next"));

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // sign-IN only; new accounts go through /signup with an invite
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    const noAccount = /signup|not allowed|not found/i.test(error.message);
    return {
      error: noAccount
        ? "No Klimr account for this email yet. Sign up with your invite code first."
        : error.message,
      email,
    };
  }
  return { ok: true, email };
}
