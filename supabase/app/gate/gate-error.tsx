"use client";

import { useEffect, useState } from "react";

/**
 * Shows a gate message, then fades it out after 10 seconds and strips the given
 * query param (default `error`) from the URL so a refresh doesn't resurface it.
 */
export function GateError({ message, param = "error", tone = "brand" }: { message: string; param?: string; tone?: "brand" | "mute" }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setShow(false);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete(param);
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {
        /* no-op */
      }
    }, 10000);
    return () => clearTimeout(t);
  }, [param]);

  if (!show) return null;
  return <p className={`mt-3 text-center text-[13px] ${tone === "mute" ? "text-mute" : "text-brand-deep"}`}>{message}</p>;
}
