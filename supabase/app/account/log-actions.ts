"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrubLogRow } from "@/lib/log-scrub";

type Level = "error" | "warn" | "info";
const LEVELS: Level[] = ["error", "warn", "info"];

/**
 * Record a client-side error so admins can see it on Admin → Diagnostics.
 * Writes via the service role. Identity and user-agent are derived server-side
 * (not client-spoofable). Lengths are capped and failures are swallowed — this
 * must never throw or surface to the user.
 */
export async function recordClientError(input: {
  level?: string;
  message: string;
  detail?: string;
  url?: string;
}): Promise<void> {
  const message = String(input?.message ?? "").trim().slice(0, 1000);
  if (!message) return;

  const level: Level = LEVELS.includes(input?.level as Level) ? (input!.level as Level) : "error";
  const detail = input?.detail ? String(input.detail).slice(0, 6000) : null;
  const url = input?.url ? String(input.url).slice(0, 300) : null;

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* anonymous — fine */
  }

  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent")?.slice(0, 400) ?? null;
  } catch {
    /* noop */
  }

  try {
    const admin = createAdminClient();
    // KCDX-068: message, detail and url here are supplied by the client. Even
    // with a trusted first-party caller, whatever the browser had in scope should
    // not become a durable row verbatim.
    const row = scrubLogRow({ message, detail, url, userAgent });
    await admin.from("error_logs").insert({ user_id: userId, level, ...row });
  } catch {
    /* never let logging break anything */
  }
}
