"use client";

/**
 * Renders an ISO timestamp in the viewer's local timezone. Server render uses
 * the server TZ; after hydration the browser re-renders in the user's local
 * time (suppressHydrationWarning keeps React quiet about the expected diff).
 */
export function LocalTime({ iso, withYear = false }: { iso: string; withYear?: boolean }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(withYear ? { year: "numeric" } : {}),
  };
  return <span suppressHydrationWarning>{d.toLocaleString(undefined, opts)}</span>;
}
