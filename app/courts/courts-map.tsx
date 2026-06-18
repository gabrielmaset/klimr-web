"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";

export type MapCourt = {
  id: string;
  name: string;
  sports: string[];
  neighborhood: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Westside LA fallback center (Mar Vista).
const FALLBACK: [number, number] = [-118.4309, 34.0119];

export function CourtsMap({ token, courts }: { token: string | null; courts: MapCourt[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const mbRef = useRef<(typeof import("mapbox-gl"))["default"] | null>(null);
  const [ready, setReady] = useState(false);

  // Initialise the map once (client-only, dynamic import keeps mapbox-gl out of SSR).
  useEffect(() => {
    if (!token || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mbRef.current = mapboxgl;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: FALLBACK,
        zoom: 10.5,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        if (cancelled) return;
        mapRef.current = map;
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [token]);

  // (Re)draw markers whenever the filtered court set changes.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mbRef.current;
    if (!ready || !map || !mapboxgl) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const pts = courts.filter((c) => typeof c.lat === "number" && typeof c.lng === "number");
    if (pts.length === 0) {
      map.flyTo({ center: FALLBACK, zoom: 10.5, duration: 500 });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    for (const c of pts) {
      const lng = c.lng as number;
      const lat = c.lat as number;
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#ff4e1b;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.32);cursor:pointer";
      const place = escapeHtml([c.neighborhood, c.city].filter(Boolean).join(", "));
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
        `<div style="font:600 13px Inter,system-ui,sans-serif;color:#18181b">${escapeHtml(c.name)}</div>` +
          (place ? `<div style="font:500 11px Inter,system-ui,sans-serif;color:#71717a;margin-top:2px">${place}</div>` : "") +
          `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener" style="font:600 11px Inter,system-ui,sans-serif;color:#d63a0f;margin-top:6px;display:inline-block;text-decoration:none">Open in Maps →</a>`,
      );
      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
    }

    if (pts.length === 1) {
      map.flyTo({ center: [pts[0].lng as number, pts[0].lat as number], zoom: 13, duration: 600 });
    } else {
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 600 });
    }
  }, [courts, ready]);

  if (!token) {
    return (
      <div className="grid h-64 place-items-center rounded-3xl border border-dashed border-rule bg-surface text-center sm:h-72">
        <div className="px-6">
          <div className="text-sm font-semibold text-ink">Map view</div>
          <p className="mx-auto mt-1 max-w-xs text-xs text-mute">
            The interactive map turns on once a Mapbox token is added. The court list below works either way.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-3xl border border-rule sm:h-72" />;
}
