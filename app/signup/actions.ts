"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignupState = { ok?: boolean; error?: string; email?: string; code?: string };

export async function signUpWithInvite(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase();

  if (!/^[A-Z0-9-]{8,40}$/.test(code)) {
    return { error: "Enter your invite code.", email, code };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address.", email, code };
  }

  // Friendly pre-check (the database trigger is the real gate either way).
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses")
    .eq("code", code)
    .maybeSingle();
  if (!invite || invite.uses >= invite.max_uses) {
    return {
      error: "That invite code is not valid or has been fully used. Check it and try again, or write hello@klimr.com.",
      email,
      code,
    };
  }

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { invite_code: code },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/onboarding")}`,
    },
  });
  if (error) return { error: error.message, email, code };
  return { ok: true, email };
}
