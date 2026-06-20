// Lightweight client-side diagnostics logger.
//
// Everything stays on the user's device (localStorage, capped ring buffer).
// It captures: explicit logger.error/warn/info calls, anything sent to
// console.error / console.warn, uncaught errors, and unhandled promise
// rejections. The user can export the whole thing as a text file from
// Settings → Diagnostics and send it to support.

export type LogLevel = "error" | "warn" | "info";
export type LogEntry = { t: string; level: LogLevel; msg: string; detail?: string; url?: string };

import { recordClientError } from "@/app/account/log-actions";

const KEY = "klimr_logs";
const MAX = 300;

let installed = false;

function read(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    /* storage full or unavailable — drop silently */
  }
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ""}`;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function add(level: LogLevel, msg: string, detail?: unknown, report = false) {
  if (typeof window === "undefined") return;
  const entry: LogEntry = {
    t: new Date().toISOString(),
    level,
    msg: String(msg).slice(0, 2000),
    detail: detail === undefined ? undefined : stringify(detail).slice(0, 6000) || undefined,
    url: window.location?.pathname,
  };
  const all = read();
  all.push(entry);
  write(all);

  // Errors get reported to the central store so admins can see them. The noisy
  // console.* mirror and warnings stay on-device only.
  if (report && level === "error") {
    try {
      recordClientError({ level, message: entry.msg, detail: entry.detail, url: entry.url }).catch(() => {});
    } catch {
      /* never let reporting break the app */
    }
  }
}

export const logger = {
  error: (msg: string, detail?: unknown) => add("error", msg, detail, true),
  warn: (msg: string, detail?: unknown) => add("warn", msg, detail),
  info: (msg: string, detail?: unknown) => add("info", msg, detail),

  getAll: (): LogEntry[] => read(),
  count: (): number => read().length,
  clear: () => write([]),

  /** A plain-text dump suitable for downloading and sending to support. */
  export: (): string => {
    const all = read();
    const head = [
      "Klimr diagnostics log",
      `Generated: ${new Date().toISOString()}`,
      typeof window !== "undefined" ? `Page: ${window.location.href}` : "",
      typeof navigator !== "undefined" ? `Browser: ${navigator.userAgent}` : "",
      `Entries: ${all.length}`,
      "=".repeat(64),
    ]
      .filter(Boolean)
      .join("\n");
    const body = all
      .map((e) => `[${e.t}] ${e.level.toUpperCase()}${e.url ? `  ${e.url}` : ""}\n${e.msg}${e.detail ? `\n${e.detail}` : ""}`)
      .join("\n\n");
    return `${head}\n\n${body || "(no entries logged)"}\n`;
  },

  /** Hook global error sources. Safe to call repeatedly; only installs once. */
  install: () => {
    if (installed || typeof window === "undefined") return;
    installed = true;

    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);

    console.error = (...args: unknown[]) => {
      try {
        add("error", args.map(stringify).join(" ").slice(0, 2000));
      } catch {
        /* never let logging break the app */
      }
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      try {
        add("warn", args.map(stringify).join(" ").slice(0, 2000));
      } catch {
        /* noop */
      }
      origWarn(...args);
    };

    window.addEventListener("error", (e: ErrorEvent) => {
      add("error", e.message || "Uncaught error", e.error ?? `${e.filename}:${e.lineno}:${e.colno}`, true);
    });
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      add("error", "Unhandled promise rejection", e.reason, true);
    });
  },
};
