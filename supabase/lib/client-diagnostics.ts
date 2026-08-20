"use client";

import { recordClientError } from "@/app/account/log-actions";

/** Client-side error reporting → Admin → Diagnostics (error_logs).
 *  Wraps the existing server action with flood guards so a looping error
 *  can't spam the log: per-message 60s dedupe + 20 reports/min ceiling. */

const seen = new Map<string, number>(); // hash → last sent (ms)
let windowStart = 0;
let windowCount = 0;

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

export function reportClientError(input: { level?: "error" | "warn"; message: string; detail?: string; userMessage?: string }) {
  try {
    const message = String(input.message ?? "").trim();
    if (!message) return;
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount >= 20) return; // ceiling per minute
    const key = hash(`${input.level ?? "error"}|${message}`);
    const last = seen.get(key) ?? 0;
    if (now - last < 60_000) return; // same message once a minute
    seen.set(key, now);
    windowCount++;
    const detail = [
      input.userMessage ? `User saw: “${input.userMessage}”` : null,
      input.detail,
    ]
      .filter(Boolean)
      .join("\n\n");
    void recordClientError({
      level: input.level ?? "error",
      message: `[client] ${message}`.slice(0, 1000),
      detail: detail ? detail.slice(0, 6000) : undefined,
      url: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
    });
  } catch {
    /* reporting must never break the app */
  }
}
