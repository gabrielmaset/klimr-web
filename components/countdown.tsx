"use client";

import { useEffect, useState } from "react";

/** Daylight feed-hero countdown: big Space Grotesk digits from a real ISO time.
 *  Caption swaps HRS : MIN → MATCH TIME (value NOW) once started (spec §3.1/§5). */
export function Countdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const diff = new Date(startsAt).getTime() - now;
  const started = diff <= 0;
  const totalMin = Math.max(0, Math.round(diff / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return (
    <div className="text-right">
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[.2em] text-flame-text">First serve in</p>
      <p className="mt-1 font-display text-[54px] font-bold leading-none tracking-[-0.02em] text-ink">
        {started ? "NOW" : `${h}:${String(m).padStart(2, "0")}`}
      </p>
      <p className="mt-1 font-mono text-[9.5px] font-bold uppercase tracking-[.2em] text-faint">
        {started ? "Match time" : "HRS : MIN"}
      </p>
    </div>
  );
}
