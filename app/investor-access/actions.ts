"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateCookieName, gateToken } from "@/lib/gate";

const secure = process.env.NODE_ENV === "production";

/**
 * Investor-code portal. Validates a reusable access code and opens the demo.
 * The code is not consumed; we just record last_used_at for your reference.
 */
export async function enterInvestor(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) redirect("/investor-access?error=1");

  const admin = createAdminClient();
  const { data } = await admin
    .from("investor_codes")
    .select("code, active, expires_at")
    .eq("code", code)
    .maybeSingle();

  // Must exist, be active, and not past its 7-day expiry.
  const expiresAt = data ? new Date(data.expires_at).getTime() : 0;
  const now = Date.now();
  if (!data || !data.active || expiresAt <= now) redirect("/investor-access?error=1");

  await admin
    .from("investor_codes")
    .update({ last_used_at: new Date().toISOString() })
    .eq("code", code);

  // Access never outlives the code: the cookie expires when the code does.
  const maxAge = Math.max(60, Math.floor((expiresAt - now) / 1000));

  const jar = await cookies();
  jar.set(gateCookieName("investor"), gateToken("investor"), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });
  redirect("/investors");
}
