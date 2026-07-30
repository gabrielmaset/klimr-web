"use client";

import { useEffect, useRef } from "react";

/** Minimal marker map for the Suggest-a-court flow (the Google-search
 *  ingestion UI). The main Courts finder has its own full map
 *  (courts-map.tsx) — this one just shows numbered search hits so the
 *  suggester can eyeball locations before confirming. */

export type LegacyMapCourt = {
  id: string;
  name: string;
  sports: string[];
  neighborhood: string | null;
  city: string | null;
  lat: number;
  lng: number;
  label: string;
};

export function LegacyCourtsMap({ token, courts, tall }: { token: string | null; courts: LegacyMapCourt[]; tall?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const height = tall ? "h-[560px]" : "h-[380px]";

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [-118.4, 34.02],
        zoom: 10,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (!courts.length) return;
      const bounds = new mapboxgl.LngLatBounds();
      for (const c of courts) {
        if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
        const el = document.createElement("div");
        el.style.cssText =
          "width:26px;height:26px;border-radius:8px;background:#201B12;color:#fff;display:grid;place-items:center;" +
          "font:700 11px 'JetBrains Mono',monospace;border:2px solid #fff;box-shadow:0 2px 6px rgba(32,27,18,.35);cursor:default;";
        el.textContent = c.label;
        el.setAttribute("aria-label", c.name);
        el.title = [c.name, c.city].filter(Boolean).join(" · ");
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map);
        markersRef.current.push(marker);
        bounds.extend([c.lng, c.lat]);
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 400 });
    })();
    return () => {
      cancelled = true;
    };
  }, [courts, token]);

  if (!token) {
    return (
      <div className={`${height} grid place-items-center rounded-2xl border border-rule bg-well px-6 text-center`}>
        <p className="text-sm text-mute">
          Map unavailable — <span className="font-mono text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</span> isn&apos;t set.
        </p>
      </div>
    );
  }
  return <div ref={containerRef} className={`${height} w-full overflow-hidden rounded-2xl border border-rule`} />;
}
