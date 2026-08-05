"use client";

import { useEffect, useState } from "react";

/** Live countdown to a waitlist offer's expiry (h:mm:ss above an hour). */
export function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (left === null) return <span className="font-mono font-bold tabular-nums">—:—</span>;
  const h = Math.floor(left / 3600);
  const mm = Math.floor((left % 3600) / 60);
  const ss = left % 60;
  const txt = h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
  return <span className="font-mono font-bold tabular-nums">{txt}</span>;
}
