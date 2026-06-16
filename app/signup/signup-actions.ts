"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignupState = { ok?: boolean; error?: string; email?: string; code?: string };

const MIN_PASSWORD = 10;

export async function signUpWithInvite(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const password = String(formData.get("password") || "");

  if (!/^[A-Z0-9-]{8,40}$/.test(code)) {
    return { error: "Enter your invite code.", email, code };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address.", email, code };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Use a password of at least ${MIN_PASSWORD} characters.`, email, code };
  }

  // Friendly pre-check (the database trigger is the real gate either way).
  const admin = createAdminClient();
  const { data: invite, error: lookupError } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses")
    .eq("code", code)
    .maybeSingle();
  if (lookupError) console.error("[signup] invite lookup error:", lookupError);

  if (!invite || invite.uses >= invite.max_uses) {
    return {
      error:
        "That invite code is not valid or has been fully used. Check it and try again, or write hello@klimr.com.",
      email,
      code,
    };
  }

  const supabase = await createClient();
  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { invite_code: code },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/onboarding")}`,
    },
  });

  if (error) {
    const msg = error.message || "";
    const code2 = (error as { code?: string }).code;
    if (code2 === "weak_password" || /password/i.test(msg)) {
      return {
        error: "Choose a stronger password — longer, and not one found in known breaches.",
        email,
        code,
      };
    }
    if (/invite|database error/i.test(msg)) {
      return {
        error:
          "We couldn't complete signup with that invite — it may have just been used. Write hello@klimr.com.",
        email,
        code,
      };
    }
    // Anything else: stay generic (never reveal whether the email already exists).
    return { error: "We couldn't create your account. Try again in a moment.", email, code };
  }

  // Supabase obfuscates the already-registered case, so this message is safe and uniform.
  return { ok: true, email };
}
