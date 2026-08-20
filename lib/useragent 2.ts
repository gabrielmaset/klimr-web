// Minimal, dependency-free user-agent parsing for the login-activity list.
// Good enough to show "Chrome on macOS · Desktop"; not a fingerprint.

export type ParsedUA = { device: string; browser: string; os: string };

export function parseUserAgent(ua: string | null): ParsedUA {
  const s = ua ?? "";

  let os = "Unknown";
  if (/Windows NT/i.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/Linux/i.test(s)) os = "Linux";

  let browser = "Unknown";
  if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/CriOS/i.test(s)) browser = "Chrome";
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = "Chrome";
  else if (/Firefox\/|FxiOS/i.test(s)) browser = "Firefox";
  else if (/Version\/.*Safari\//i.test(s)) browser = "Safari";

  let device = "Desktop";
  if (/iPad|Tablet/i.test(s)) device = "Tablet";
  else if (/Mobi|iPhone|Android.*Mobile/i.test(s)) device = "Mobile";

  return { device, browser, os };
}

/** "Chrome · macOS" style label; falls back gracefully when unknown. */
export function summarizeUA(p: { browser: string | null; os: string | null }): string {
  const parts = [p.browser && p.browser !== "Unknown" ? p.browser : null, p.os && p.os !== "Unknown" ? p.os : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Unknown device";
}
