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

  // ── TEMPORARY DIAGNOSTIC ─────────────────────────────────────────────
  // Surfaces the real reason the invite lookup fails instead of the generic
  // "invalid code" message. Revert to the friendly message once fixed.
  const admin = createAdminClient();

  const { data: invite, error: lookupError } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses")
    .eq("code", code)
    .maybeSingle();

  if (lookupError) {
    console.error("[signup] invite lookup failed:", lookupError);
    return {
      error: `[diagnostic] Invite lookup failed: ${lookupError.message} (code ${lookupError.code ?? "?"})`,
      email,
      code,
    };
  }

  if (!invite) {
    // No error, but this code wasn't found. Check whether the app's
    // service-role connection can see ANY codes at all — this separates
    // "wrong code / wrong project" from "can't read the table".
    const { count, error: countError } = await admin
      .from("invite_codes")
      .select("*", { count: "exact", head: true });
    console.error("[signup] code not found. visible codes:", count, "countError:", countError);
    return {
      error: countError
        ? `[diagnostic] Invite table unreadable: ${countError.message} (code ${countError.code ?? "?"})`
        : `[diagnostic] Code not found. The app can see ${count ?? 0} code(s) in its database.`,
      email,
      code,
    };
  }

  if (invite.uses >= invite.max_uses) {
    return {
      error: "That invite code has already been fully used. Write hello@klimr.com for a new one.",
      email,
      code,
    };
  }
  // ── END DIAGNOSTIC ───────────────────────────────────────────────────

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
