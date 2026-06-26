"use client";

import { useEffect, useState } from "react";

/**
 * Shows a gate error message, then fades it out after 10 seconds and strips the
 * ?error param from the URL so a refresh doesn't resurface it.
 */
export function GateError({ message }: { message: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setShow(false);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {
        /* no-op */
      }
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  return <p className="mt-3 text-center text-[13px] text-brand-deep">{message}</p>;
}
