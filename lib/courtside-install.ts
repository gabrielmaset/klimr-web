"use client";

/** Per-install identity for a courtside display (K2-05 device ops).
 *
 *  A UUID minted the first time this browser/device opens a courtside display
 *  and kept in localStorage, so the same physical unit reports as the same
 *  device across restarts, sessions, and days. It is an OPERATIONS identifier
 *  only — nothing is authorized by it, so a cleared cache simply produces a new
 *  device row the operator can name or retire.
 *
 *  Kiosk browsers and private windows can block storage; in that case we fall
 *  back to an in-memory id, which still gives correct "running live play"
 *  counts for the life of the page rather than silently reporting nothing. */
const KEY = "klimr.courtside.installId";
const TOKEN_KEY = "klimr.courtside.token";
let memoryId: string | null = null;
let memoryToken: string | null = null;

function mint(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Very old WebViews: build a v4-shaped id from getRandomValues.
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

export function getInstallId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = mint();
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    memoryId = memoryId ?? mint();
    return memoryId;
  }
}

/** Build identifier used for STALE BUILD detection in /admin/devices. Vercel
 *  exposes the commit SHA to the client automatically for Next.js projects. */
export function appVersion(): string {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : "dev";
}

/** Coarse connection description — useful for diagnosing a venue's Wi-Fi
 *  without collecting anything identifying. */
export function networkState(): string {
  if (typeof navigator === "undefined") return "unknown";
  if (!navigator.onLine) return "offline";
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType ? `online:${c.effectiveType}` : "online";
}

export async function batteryPct(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (!nav.getBattery) return null;
    const b = await nav.getBattery();
    return Math.round(b.level * 100);
  } catch {
    return null;
  }
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function writeToken(t: string): void {
  memoryToken = t;
  try {
    window.localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* kiosk/private mode: memory-only for the life of the page */
  }
}

/** Ensure this display holds a valid device token, registering against the
 *  session's join code if it does not (migration 0184). The token is minted by
 *  the server and returned exactly once; we never invent one client-side. */
export async function ensureDeviceToken(code: string, isApp: boolean): Promise<string | null> {
  const existing = readToken();
  if (existing) return existing;
  if (!code) return null;
  try {
    const r = await fetch("/api/courtside/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installId: getInstallId(),
        code,
        platform: isApp ? "ios-app" : "web",
        appVersion: appVersion(),
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: string };
    if (!j.token) return null;
    writeToken(j.token);
    return j.token;
  } catch {
    return null;
  }
}

/** Called when a heartbeat is rejected: the token was revoked (the operator
 *  retired this unit) or the row was cleared. Dropping it lets the next beat
 *  re-register cleanly instead of failing forever. */
export function clearDeviceToken(): void {
  memoryToken = null;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}
