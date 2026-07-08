"use client";

import dynamic from "next/dynamic";
import type { CardEvent } from "@/components/events-browser";

const Inner = dynamic(() => import("./events-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-bg text-xs font-semibold text-faint">Loading map…</div>
  ),
});

export function EventsMap(props: { events: CardEvent[]; userLoc: { lat: number; lng: number } | null; radiusMi: number | null }) {
  return <Inner {...props} />;
}
