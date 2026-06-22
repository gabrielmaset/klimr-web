"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parseUserAgent } from "@/lib/useragent";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emails/templates";

/** Record a completed sign-in (called after the 2FA step succeeds) for the security
 *  page's login-activity list. Values come from request headers, never the client. */
export async function recordLogin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const h = await headers();
  const ua = h.get("user-agent");
  const xff = h.get("x-forwarded-for");
  const ip = xff ? (xff.split(",")[0] ?? "").trim() || null : h.get("x-real-ip");
  const parsed = parseUserAgent(ua);
  const city = h.get("x-vercel-ip-city");
  const region = h.get("x-vercel-ip-country-region");
  const country = h.get("x-vercel-ip-country");

  try {
    const { count } = await supabase.from("login_events").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const firstLogin = (count ?? 0) === 0;

    await supabase.from("login_events").insert({
      user_id: user.id,
      ip,
      user_agent: ua ? ua.slice(0, 400) : null,
      device: parsed.device,
      browser: parsed.browser,
      os: parsed.os,
      city: city ? decodeURIComponent(city) : null,
      region: region || null,
      country: country || null,
    });

    // Welcome only genuinely new accounts: first recorded login + freshly created.
    const created = user.created_at ? new Date(user.created_at).getTime() : 0;
    const fresh = created > 0 && Date.now() - created < 24 * 60 * 60 * 1000;
    if (firstLogin && fresh && user.email) {
      const origin = h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://klimr.com";
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const { subject, html } = welcomeEmail({ name: prof?.display_name ?? "there", appUrl: `${origin}/account` });
      await sendEmail({ to: user.email, subject, html });
    }
  } catch (e) {
    console.error("[login] record failed", e);
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signOutEverywhereAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/");
}
