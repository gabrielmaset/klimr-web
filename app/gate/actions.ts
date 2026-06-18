"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateCookieName, gateToken } from "@/lib/gate";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const secure = process.env.NODE_ENV === "production";

/**
 * Invite-code portal for klimr.com. Validates the code WITHOUT consuming it —
 * consumption happens only at real signup — then opens the site and remembers
 * the code so /signup can prefill it.
 */
export async function enterSite(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) redirect("/gate?error=1");

  const admin = createAdminClient();
  const { data } = await admin
    .from("invite_codes")
    .select("code, max_uses, uses, active")
    .eq("code", code)
    .maybeSingle();

  // Must be a real, active, not-yet-exhausted invite — uses is NOT incremented here.
  if (!data || !data.active || data.uses >= data.max_uses) redirect("/gate?error=1");

  const jar = await cookies();
  jar.set(gateCookieName("site"), gateToken("site"), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  // Plain code, read back by /signup to prefill. Not security-sensitive.
  jar.set("klimr_invite", code, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  redirect("/");
}
