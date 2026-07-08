"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-diagnostics";

const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Load failed$/i];

/** Mounted once in the root layout: forwards every uncaught browser error and
 *  unhandled promise rejection to Admin → Diagnostics. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const msg = e.message || String(e.error ?? "Unknown error");
      if (NOISE.some((re) => re.test(msg))) return;
      reportClientError({
        message: `Uncaught: ${msg}`,
        detail: [e.error instanceof Error ? e.error.stack : null, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null]
          .filter(Boolean)
          .join("\n"),
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg = r instanceof Error ? r.message : String(r ?? "Unknown rejection");
      if (NOISE.some((re) => re.test(msg))) return;
      reportClientError({ message: `Unhandled rejection: ${msg}`, detail: r instanceof Error ? r.stack : undefined });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
